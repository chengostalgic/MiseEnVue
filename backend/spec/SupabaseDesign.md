# Supabase + PostgreSQL Design Principles

## Purpose

This document defines the backend design principles for a lightweight, scalable, multi-tenant restaurant intelligence platform built with **Supabase + PostgreSQL**.

It is the *why*. [`schema.md`](./schema.md) is the *what* — runnable DDL — and [`architecture.md`](./architecture.md) is the *how*. Where a specific value appears in both, those documents are authoritative and this one defers to them.

The goal is to keep the MVP simple while avoiding schema and security decisions that become painful to undo later.

The main ideas are:

- model the tenant explicitly, and put its key on every tenant-owned row
- enforce tenant isolation in PostgreSQL, not in application code
- route every ownership check through one function so tenancy can evolve
- design indexes around real query patterns
- keep structured product data relational
- keep messy external payloads in their own landing table
- make ingestion retry-safe
- keep expensive analytics off the request path
- use database constraints to protect data quality
- scale only when measurements show it is necessary

---

# 0. How This Document Relates to the Other Four

Read [`backend-prompt.md`](./backend-prompt.md) → [`architecture.md`](./architecture.md) → [`schema.md`](./schema.md) → [`extensibility.md`](./extensibility.md) first. This document is the principle layer underneath them.

An earlier draft of this file was written before the schema was settled and proposed a different tenancy model. Those conflicts have been resolved in favour of the other four documents, because they are what the migrations actually implement. The substantive changes:

| Topic | Earlier draft | Now, matching the implementation |
|---|---|---|
| Tenant | `organizations` + `organization_members` join table | `restaurants` with a single `owner_id` |
| Tenant key on rows | `organization_id` | `restaurant_id` |
| Operational unit | `restaurant_locations` under an organization | the restaurant itself; multi-location is deferred |
| Ownership predicate | inline `exists (select … from organization_members …)` | `public.owns_restaurant(restaurant_id)` |
| Money | integer cents (`price_cents bigint`) | `numeric(10,2)`, and `numeric(10,4)` for unit cost |
| Raw provider payloads | a `raw_payload` column on `trend_signals` | a separate `raw_signals` landing table |
| Ingestion idempotency key | `(organization_id, provider, provider_record_id)` | `(source, source_id)` on `raw_signals` |
| Precomputed analytics | a `daily_sales_summary` table | three views; a summary table is the next step, not the first |
| Migration filenames | `001_create_organizations.sql` … | `0001_enums.sql` … `0008_rls.sql` |
| Runtime | included Python workers as a trusted backend | Supabase Edge Functions only; Python is a documented escape hatch |

The single-owner decision is worth stating plainly, because it is the one that looks like a shortcut and is not. `restaurants.owner_id` is deliberate MVP scope, and the migration to membership is written out in [`extensibility.md`](./extensibility.md#multi-user-restaurants) with a real cost estimate. Principle 1 below explains why that migration stays cheap.

---

# 1. Model the Tenant Explicitly, and Make the Predicate Replaceable

Two separate decisions get conflated here. Keep them apart.

**Decision one: what is the tenant?** For this product it is the restaurant. Every row of application data belongs to exactly one restaurant, and `restaurants` is the root of the ownership tree.

**Decision two: how do you decide whether a user may see a tenant's rows?** For the MVP, one user owns one restaurant:

```sql
create table restaurants (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  timezone   text not null default 'America/Chicago',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

```text
auth.users
     │  owner_id
     ▼
restaurants
     │
     ├── menu_items ── ingredients ── inventory_counts
     ├── sales
     ├── uploads
     ├── opportunities ── opportunity_evidence
     ├── campaigns ── campaign_assets
     └── experiments ── experiment_results
```

Real restaurants have an owner, a GM, and a chef who all want access, so decision two will change. What makes that survivable is never writing the predicate inline. Write it once:

```sql
create or replace function public.owns_restaurant(rid uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from restaurants r
    where r.id = rid and r.owner_id = auth.uid()
  );
$$;
```

and call it from every policy:

```sql
create policy menu_items_tenant on menu_items
  for all to authenticated
  using (public.owns_restaurant(restaurant_id))
  with check (public.owns_restaurant(restaurant_id));
```

Adding teams later means redefining that one function against a `restaurant_members` table. Roughly fifteen policies pick up the new semantics for free. Had the predicate been inlined as `owner_id = auth.uid()`, the same change would be a fifteen-policy rewrite with fifteen chances to miss one and leak data.

Avoid, therefore, not the single-owner model but the inlined check:

```sql
-- fine as a decision, wrong as a policy body
using (restaurant_id in (select id from restaurants where owner_id = auth.uid()))
```

---

# 2. Do Not Add a Level Above the Tenant Before You Need One

A restaurant group with eight locations wants per-location menus and sales plus rolled-up reporting. That is a real product, and it is not this one yet.

Multi-location inserts a new level *above* `restaurants` and rewrites every ownership predicate and every aggregate query. [`extensibility.md`](./extensibility.md#multi-location-restaurant-groups) prices it at about a week and marks it structural — the most expensive item on that list.

So for the MVP the restaurant is both the tenant and the operational unit:

```text
restaurants
    ├── menu_items
    ├── sales
    └── opportunities
```

rather than:

```text
organizations
    └── restaurant_locations
            ├── menu_items
            └── sales
```

One consequence worth accepting deliberately: a two-location owner currently creates two restaurants and sees two dashboards. That is an honest limitation, not a bug, and it is cheaper than carrying an unused hierarchy through every query in the system.

The ordering rule if both are coming: **do multi-location before multi-user.** Doing tenancy twice is significantly worse than doing it once at the right level.

---

# 3. Put `restaurant_id` on Tenant-Owned Tables

Even when ownership could be inferred through joins, carry the tenant key explicitly.

Prefer:

```sql
sales (
  id,
  restaurant_id,
  menu_item_id,
  sold_at,
  quantity,
  revenue
)
```

over:

```sql
sales (
  id,
  menu_item_id,   -- ownership reachable only via menu_items
  sold_at,
  quantity,
  revenue
)
```

Benefits:

- simpler RLS policies — one function call instead of a join
- faster tenant-scoped queries
- easier debugging and bulk export
- a sale survives deleting its menu item and is still attributable

That last point is not hypothetical. `sales.menu_item_id` is nullable with `on delete set null`, precisely so an unmatched CSV row or a discontinued item does not destroy revenue history. Without `restaurant_id` on the row, a null `menu_item_id` would orphan it entirely.

Most application queries should naturally include:

```sql
where restaurant_id = $1
```

The exception is layer 3. `trends`, `trend_signals`, `raw_signals`, and `ingest_runs` have **no** `restaurant_id`, because a trend belongs to the market rather than to a tenant. See principle 13.

---

# 4. Use Row Level Security as the Security Boundary

Do not depend only on frontend or backend filters for tenant isolation.

Application code like this is useful:

```ts
supabase
  .from('sales')
  .select('*')
  .eq('restaurant_id', restaurantId)
```

But it is not enough by itself. One forgotten `.eq()` in one code path is a cross-tenant leak.

Enable RLS on **every** table:

```sql
alter table sales enable row level security;
```

Then write the policy:

```sql
create policy sales_tenant on sales
  for all to authenticated
  using (public.owns_restaurant(restaurant_id))
  with check (public.owns_restaurant(restaurant_id));
```

**Both clauses are required.** `using` filters what you can read, update, and delete. `with check` validates what you insert or update into. A policy with only `using` lets a user insert rows onto someone else's restaurant, which is the more damaging half.

The intended rule is:

```text
Application filter = performance / query intent
RLS policy        = security
```

Use both.

A table with RLS off is readable by anyone holding the anon key. There is no table in this schema for which that is acceptable, including the internal ones — see principle 13.

---

# 5. Keep Service Credentials Server-Side

Never expose the Supabase service role key in client code.

Browser:

```text
anon key
+ authenticated user JWT
+ RLS
```

Trusted backend:

```text
service role key
+ Edge Function secrets only
```

The service role bypasses RLS completely. Every policy in this project is void for any code holding it, which makes it the sharpest object in the repository.

The discipline that follows:

- It lives only in Edge Function secrets. Never in a client bundle, never committed.
- Only `job-*` functions use it.
- User-facing functions build their Supabase client from the anon key plus the caller's forwarded `Authorization` header, so RLS applies to them exactly as it does to the frontend.

**A user-facing Edge Function that uses the service role has silently disabled authorization for that endpoint, and no policy will save you.** That is the single highest-risk line of code in the project.

Note what is *not* on the trusted-backend list: there is no Python worker, no separate API server, and no queue. The runtime is Supabase only. [`extensibility.md`](./extensibility.md#swapping-in-a-python-service) documents when a Python service becomes justified and what it costs; until then, adding one adds a second place the service role key has to be protected.

---

# 6. Explicitly Filter by Tenant Even When RLS Exists

Do not rely on RLS to perform all query filtering.

Prefer:

```ts
supabase
  .from('opportunities')
  .select('*')
  .eq('restaurant_id', restaurantId)
  .eq('status', 'new')
  .order('overall_score', { ascending: false })
```

rather than:

```ts
supabase
  .from('opportunities')
  .select('*')
```

RLS protects the data. Explicit filtering lets PostgreSQL use `opportunities_ranked_idx`, which leads with `restaurant_id`. Relying on the policy alone can produce a scan that the policy then filters — correct, but needlessly expensive.

---

# 7. Index Around Real Query Patterns

Do not index every column blindly. Start from actual application queries.

The opportunity feed is the primary product query:

```sql
select *
from opportunities
where restaurant_id = $1
  and status = 'new'
order by overall_score desc
limit 20;
```

so:

```sql
create index opportunities_ranked_idx
  on opportunities (restaurant_id, status, overall_score desc);
```

Recent sales for a dashboard:

```sql
select *
from sales
where restaurant_id = $1
  and sold_at between $2 and $3;
```

so:

```sql
create index sales_restaurant_time_idx on sales (restaurant_id, sold_at desc);
```

One item's history, for baselines:

```sql
create index sales_item_time_idx on sales (menu_item_id, sold_at desc);
```

Both sales indexes end in `sold_at desc` because every question is about a recent window.

Index column order should match how the table is filtered and then sorted.

---

# 8. Index Foreign Keys and Lookup Paths You Actually Use

A foreign key does not create an index on the referencing side. If the application runs a lookup, index it.

```sql
create index mii_ingredient_idx on menu_item_ingredients (ingredient_id);
create index sales_upload_idx   on sales (upload_id);
```

`sales_upload_idx` earns its place for a specific operational reason: a bad import is reversed by deleting rows by `upload_id`, and that should not be a sequential scan of the largest table in the database.

Two index shapes here are doing product work rather than generic lookup work:

```sql
create index menu_items_tags_idx  on menu_items using gin (tags);
create index trends_keywords_idx  on trends     using gin (keywords);
```

Those two GIN indexes *are* the matching stage. Keyword overlap between `menu_items.tags` and `trends.keywords` is how a trend finds a candidate dish before `pgvector` exists.

Fields worth reviewing whenever a table is added: `restaurant_id`, `menu_item_id`, `ingredient_id`, `trend_id`, `opportunity_id`, `campaign_id`, `experiment_id`, `upload_id`.

---

# 9. Scope Unique Constraints to Their Real Namespace

Do not make an identifier globally unique if it is only unique within a smaller scope.

Tenant-scoped, and functional so that CSV upserts behave:

```sql
create unique index menu_items_name_key
  on menu_items (restaurant_id, lower(trim(name)));

create unique index ingredients_name_key
  on ingredients (restaurant_id, lower(trim(name)));
```

These have to be unique *indexes* rather than table constraints because they wrap the column in functions. That wrapping is the point: without it, uploading `menu.csv` twice creates `"Wings"` and `"wings "` as separate items and sales rows then split across both.

Provider-scoped rather than tenant-scoped, because the provider's namespace is the real one:

```sql
constraint raw_signals_source_key unique (source, source_id)
```

Region-scoped, with an explicit NULL sentinel:

```sql
create unique index trends_slug_region_key
  on trends (slug, coalesce(region, '*'));
```

The `coalesce` is required. PostgreSQL treats NULLs as distinct, so without it an unlimited number of duplicate national trend rows can accumulate.

Version-scoped, so re-scoring does not destroy history:

```sql
create unique index opportunities_unique_pairing
  on opportunities (restaurant_id, trend_id, menu_item_id, scoring_version)
  nulls not distinct;
```

`nulls not distinct` (PostgreSQL 15+) is required here because `menu_item_id` is nullable for a trend with no matching dish. Under default NULL handling, "Matcha, no matching item" could be inserted unboundedly many times.

---

# 10. Composite Foreign Keys: Understood, Deliberately Not Used

PostgreSQL can enforce that a child row belongs to the same tenant as its parent. Give the parent a redundant unique key:

```sql
alter table menu_items add constraint menu_items_tenant_id_key unique (restaurant_id, id);
```

then have the child reference both columns:

```sql
foreign key (restaurant_id, menu_item_id)
  references menu_items (restaurant_id, id)
```

That makes the following state structurally impossible:

```text
sale.restaurant_id = Restaurant A
sale.menu_item_id  = a menu item owned by Restaurant B
```

**This project does not use it.** The reason is specific rather than laziness: `sales.menu_item_id` is nullable by design, and `on delete set null` must be able to clear the link while leaving `restaurant_id` intact. A composite foreign key across a nullable column complicates that behaviour for a guarantee that RLS `with check` already provides on the write path — a user cannot insert a row for a restaurant they do not own, and a service-role job that mismatches IDs is a code bug rather than a permissions gap.

Revisit if a service-role job is ever found writing mismatched pairs. Until then this is documented as considered and declined, not overlooked.

---

# 11. Use Relational Columns for Product Data

Do not store the core application model inside JSON blobs.

Avoid:

```sql
opportunities (
  id   uuid primary key,
  data jsonb
)
```

Prefer:

```sql
opportunities (
  id                             uuid primary key default gen_random_uuid(),
  restaurant_id                  uuid not null references restaurants(id) on delete cascade,
  trend_id                       uuid not null references trends(id) on delete cascade,
  menu_item_id                   uuid references menu_items(id) on delete set null,

  trend_score                    numeric(5,2) not null check (trend_score >= 0 and trend_score <= 100),
  local_relevance_score          numeric(5,2) not null check (local_relevance_score >= 0 and local_relevance_score <= 100),
  menu_fit_score                 numeric(5,2) not null check (menu_fit_score >= 0 and menu_fit_score <= 100),
  operational_fit_score          numeric(5,2) not null check (operational_fit_score >= 0 and operational_fit_score <= 100),
  profitability_score            numeric(5,2) not null check (profitability_score >= 0 and profitability_score <= 100),
  overall_score                  numeric(5,2) not null check (overall_score >= 0 and overall_score <= 100),

  suggested_price                numeric(10,2) check (suggested_price >= 0),
  estimated_incremental_profit   numeric(12,2),
  missing_ingredients            text[] not null default '{}',
  status                         opportunity_status not null default 'new'
)
```

Use normal columns for values you filter, sort, join, aggregate, validate, or display frequently. Reserve `jsonb` for data that is irregular or provider-specific.

A useful rule:

> If the product understands the field, give it a column. If only the external API understands it, `jsonb` is probably fine.

Two intermediate cases this schema uses instead of reaching for JSON:

**`text[]` with a GIN index**, for open-ended labels that still need to be searched — `menu_items.tags`, `trends.keywords`, `opportunities.missing_ingredients`. Arrays keep the values queryable without pretending they are a fixed vocabulary.

**A real `enum` type**, for closed value sets — `opportunity_status`, `sales_channel`, `campaign_channel`. Never bare `text` with the legal values listed in a comment; PostgreSQL then rejects a typo at insert time instead of letting `'Instagram'` and `'instagram'` both into the same column. Adding a value later is trivial (`alter type signal_source add value 'yelp';`); removing one requires recreating the type. Add freely, treat removal as a real migration.

The one place `jsonb` is load-bearing is `uploads.errors`, and it is structured on purpose:

```json
[
  { "row": 14, "code": "unknown_menu_item", "message": "No menu item named 'Wingz'", "value": "Wingz" },
  { "row": 22, "code": "bad_timestamp",     "message": "Could not parse '09/01/26 12:15'", "value": "09/01/26 12:15" }
]
```

That is per-row detail with no fixed shape and no need to be indexed. It is the right use.

---

# 12. Separate Raw Ingestion from Normalized Product Data

External APIs are messy and change over time. Do not write provider responses into your primary product tables.

The flow:

```text
External API
    ↓
raw_signals        ← untouched provider payload, one row per provider record
    ↓
normalization
    ↓
trends + trend_signals   ← the product's own model of the market
    ↓
opportunity generation
```

The landing table:

```sql
create table raw_signals (
  id            uuid primary key default gen_random_uuid(),
  source        signal_source not null,
  source_id     text not null,
  ingest_run_id uuid references ingest_runs(id) on delete set null,

  query         text,
  region        text,
  observed_at   timestamptz,
  payload       jsonb not null,

  fetched_at    timestamptz not null default now(),
  processed_at  timestamptz,

  constraint raw_signals_source_key unique (source, source_id)
);
```

and separately the normalized model:

```sql
create table trends (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  slug           text not null,
  category       trend_category not null default 'food',
  keywords       text[] not null default '{}',
  trend_score    numeric(5,2) not null default 0 check (trend_score >= 0 and trend_score <= 100),
  trend_velocity numeric(6,4) not null default 0,
  region         text,
  status         trend_status not null default 'active'
);
```

Three things this separation buys, beyond keeping provider formats out of the schema:

**Explainability.** When someone asks why Hot Honey scored 87, you can show them the actual Reddit threads.

**Re-runnable normalization.** Improve the extraction logic and reprocess history without re-scraping.

**A durable queue, for free.**

```sql
create index raw_signals_unprocessed_idx on raw_signals (fetched_at) where processed_at is null;
```

That partial index only ever holds the backlog, so it stays small no matter how large the table grows. `processed_at is null` *is* the job queue — durable, inspectable, and requiring no additional infrastructure.

`trends.trend_score` and `trends.trend_velocity` are **derived** from the attached `trend_signals`. Never set by hand, and never by an LLM. Naming and categorizing a trend from messy text is fuzzy language work an LLM is good at; scoring it is arithmetic that has to be reproducible.

---

# 13. Three Access Classes, Not Two

Some data belongs to the platform rather than to a restaurant. But "global vs tenant" is one distinction too few, because global data splits again by whether a user has any business reading it.

```text
Hot Honey is trending in Houston
```

is market data, and every restaurant should see it.

```text
Hot Honey is an 85.55 opportunity for Ember & Rye
```

is tenant data.

```text
{"subreddit":"houstonfood","ups":842,...}   ← the scraped payload behind it
```

is neither. It is internal machinery.

So there are three classes, and applying the wrong one is how a leak happens:

| Class | Tables | Authenticated user can | Service role can |
|---|---|---|---|
| Tenant-scoped | `restaurants`, `menu_items`, `ingredients`, `menu_item_ingredients`, `inventory_counts`, `sales`, `uploads`, `opportunities`, `opportunity_evidence`, `campaigns`, `campaign_assets`, `experiments`, `experiment_results` | read/write only their own rows | everything |
| Shared read-only | `trends`, `trend_signals` | read all rows | write |
| Internal | `raw_signals`, `ingest_runs` | nothing | everything |

Shared read-only tables get a `select` policy and nothing else:

```sql
create policy trends_read on trends
  for select to authenticated
  using (true);
```

Internal tables get RLS enabled and **zero policies**. That is not an omission — it is the strictest possible setting, and the absence of a policy is the enforcement:

```sql
alter table raw_signals enable row level security;
alter table ingest_runs enable row level security;
-- no policies, deliberately
```

Note that the tenant pattern is not merely wrong for the last two classes, it is *inexpressible*: those tables have no `restaurant_id` to filter on. If you find yourself wanting to add one, re-read principle 3.

---

# 14. Make Ingestion Idempotent

Background jobs, webhooks, and cron jobs retry. The same event will arrive more than once.

Design imports so that processing the same event twice does not create duplicate data:

```sql
constraint raw_signals_source_key unique (source, source_id)
```

then insert with a conflict clause:

```sql
insert into raw_signals (source, source_id, payload, ...)
values (...)
on conflict (source, source_id) do nothing;
```

The desired behaviour:

```text
Run once  -> correct state
Run twice -> same correct state
```

**`source_id` must be stable across runs.** It is half of the unique key, so a stable ID makes re-ingestion free, and an unstable one silently re-inserts the same evidence on every run and inflates every trend score with no error appearing anywhere.

When the provider gives you a real ID, use it. When it does not — Google Trends returns a series, not documents — synthesize deterministically from immutable inputs:

```ts
const sourceId = `${query}:${region}:${isoWeek}`;   // stable
const sourceId = `${query}:${Date.now()}`;          // WRONG: new ID every run
```

The health check for this lives in `ingest_runs`:

```sql
create table ingest_runs (
  id            uuid primary key default gen_random_uuid(),
  source        signal_source not null,
  status        run_status not null default 'running',
  fetched_count integer not null default 0,
  new_count     integer not null default 0,
  error         text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);
```

`fetched_count` versus `new_count` is the signal. Fetching 200 Reddit posts and finding 0 new ones means dedup is working. Fetching 200 and finding 200 new on *every* run means `source_id` is unstable and the scores are inflating.

The same principle covers the two user-facing import paths:

- `menu` uploads **upsert** on `(restaurant_id, lower(trim(name)))`, so re-uploading the same file updates prices instead of duplicating the menu.
- `sales` uploads are made reversible rather than idempotent, via `sales.upload_id`. Delete by `upload_id` and re-import.

And one asymmetry that is deliberate: **`sales` uploads never create menu items.** An unmatched name is a row-level error in `uploads.errors`, and the sale is inserted with a null `menu_item_id` so revenue totals stay correct while the link stays honestly missing. Auto-creating a menu item from a typo in a sales export corrupts the menu that every downstream score depends on.

---

# 15. Use Transactions for Atomic Operations, and Know Which Side Does What

If several changes form one conceptual operation, they should succeed or fail together.

```text
Accept opportunity
    ↓
Create campaign
    ↓
Create experiment
```

Avoid partially completed states. Use a transaction or a database function.

The division of labour between PostgreSQL and Edge Functions:

| Belongs in the database | Belongs in an Edge Function |
|---|---|
| updating several related rows atomically | calling OpenAI |
| creating dependent records | calling Reddit, Google Trends |
| aggregates and baselines (views, RPC) | parsing and validating CSVs |
| enforcing business invariants (constraints) | anything network-heavy |

The reason to push aggregation into the database is not performance dogma — it is that writing the arithmetic once in SQL beats writing it repeatedly in TypeScript. `menu_item_daily_sales` and `menu_item_baselines` exist so that "average units on a Friday" has exactly one definition.

One correctness note for views: **a PostgreSQL view runs with its owner's privileges by default.** These views are owned by `postgres`, so without `security_invoker` every one of them would read straight past the RLS policies and hand one restaurant's numbers to another:

```sql
create view menu_item_daily_sales
with (security_invoker = on) as
  select ...
```

That option is the only way "RLS on every table" survives contact with a view. It is asserted in the test suite rather than trusted.

---

# 16. Be Careful with `security definer`

Prefer functions that execute with the caller's permissions.

`public.owns_restaurant()` is `security invoker`, and that is the correct choice rather than the cautious one. The inner query is itself subject to the `restaurants` policy, which is exactly the predicate we want, and there is no recursion because the `restaurants` policies do not call the function. Using `definer` would work but would needlessly widen the trust boundary.

If elevated privileges are genuinely required:

- set an explicit `search_path`
- fully qualify table names
- restrict who may execute the function
- keep the function small
- accept no input that can alter SQL behaviour

Every function in this schema sets `search_path` explicitly, including the trivial ones:

```sql
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
```

Do not use elevated database functions as a shortcut around proper RLS design.

---

# 17. Use Database Constraints Aggressively

The database should reject impossible states. Application code must not be the only line of defence.

```sql
price          numeric(10,2) not null check (price >= 0)
quantity       integer       not null check (quantity > 0)
name           text          not null check (length(trim(name)) > 0)
overall_score  numeric(5,2)  not null check (overall_score >= 0 and overall_score <= 100)
```

```sql
constraint campaigns_date_order check (
  start_date is null or end_date is null or end_date > start_date
)
```

The highest-value constraint in the schema is on `experiments`:

```sql
constraint experiments_baseline_order check (baseline_end   > baseline_start),
constraint experiments_window_order   check (experiment_end > experiment_start),
constraint experiments_no_overlap     check (experiment_start >= baseline_end)
```

`experiments_no_overlap` prevents the one bug that invalidates every result the product reports: a baseline window contaminated by the campaign's own lift. The ROI would still compute, still look plausible, and be meaningless.

Also let the database compute what it can compute:

```sql
contribution numeric(10,2) generated always as (price - estimated_cost) stored
```

A generated column can never drift from its inputs, which is a stronger guarantee than remembering to recalculate it.

Use `not null`, foreign keys, unique constraints, check constraints, generated columns, and enum types. The frontend validates for user experience. PostgreSQL validates for correctness.

---

# 18. Money, Scores, and Rates Each Have One Type

Never `real` or `double precision` for anything the product reports. Floating point makes `0.1 + 0.2` a support ticket.

The conventions, declared once here and in [`architecture.md` §5](./architecture.md#5-conventions):

| Concept | Type | Note |
|---|---|---|
| Money | `numeric(10,2)` | `price`, `revenue`, `suggested_price`, `estimated_cost` |
| Larger money | `numeric(12,2)` | projections and experiment values |
| Unit cost | `numeric(10,4)` | cents-per-gram needs the extra digits |
| Quantity | `numeric(12,4)`, or `integer` for whole units sold | |
| Score | `numeric(5,2)` with `check (x >= 0 and x <= 100)` | always 0–100 |
| Rate / velocity / growth | `numeric(6,4)` | decimal fraction: `0.43` means +43% |
| Similarity | `numeric(4,3)` with `check (x >= 0 and x <= 1)` | always 0–1 |
| ROI | `numeric(8,4)` | decimal fraction: `1.6460` is 165% |

Integer cents is a perfectly reasonable alternative convention. This project uses `numeric` instead, and having chosen one, mixing them would be worse than either. `numeric(10,2)` keeps SQL readable, sums and averages exactly, and does not require every read path to divide by 100.

**The scale conventions are load-bearing, not stylistic.** The weighted scoring formula sums score columns directly:

```text
overall_score =
    0.25 × trend_strength
  + 0.15 × local_relevance
  + 0.20 × menu_fit
  + 0.15 × operational_fit
  + 0.25 × profitability
```

Feed a 0–1 similarity into that and the result is wrong, inside 0–100, and passes every check constraint. It is the most likely silent bug in the system. Two defences: name the column by its scale (`*_score`, `*_rate`, `*_similarity`), and assert the relationship in a test rather than trusting it.

---

# 19. Use `timestamptz`, and Bucket by the Restaurant's Timezone

Use timezone-aware timestamps everywhere:

```sql
created_at timestamptz not null default now()
sold_at    timestamptz not null
```

Never bare `timestamp` for a real-world event.

Store the restaurant's timezone as an IANA name:

```sql
restaurants.timezone   -- 'America/Chicago'
```

`timestamptz` alone is not sufficient, because it does not tell you which day a sale belongs to. Any query that groups by day must convert:

```sql
(s.sold_at at time zone r.timezone)::date
```

This is not a rounding detail. A Friday 11pm Houston sale is Saturday in UTC. Bucket by UTC and you understate the Friday baseline, overstate the lift of any Friday promotion, and every downstream economics number inherits the error — silently, because nothing raises.

It matters for:

- Friday sales
- dinner hours
- daily revenue
- campaign start and end dates
- day-of-week baselines, which is where it does the most damage

Validate the timezone value against `pg_timezone_names` at the application layer; the column is plain `text` and cannot enforce it.

---

# 20. Keep High-Volume Tables Lean

Some tables grow much faster than others. Here:

- `sales`
- `raw_signals`
- `trend_signals`

Treat them differently from small configuration tables like `restaurants` and `campaigns`.

For large append-heavy tables:

- avoid unnecessary updates — `sales`, `trend_signals`, `raw_signals`, `inventory_counts`, and `experiment_results` are append-only by design and do not carry `updated_at`
- keep columns compact
- keep large `jsonb` payloads out of hot query paths
- index only actual query paths
- archive or move raw data if it becomes genuinely large

`raw_signals` is the one to watch, because it is both the fastest-growing table and the one holding whole provider responses. It is also the one with the shortest useful retention (principle 31), which is not a coincidence.

Do not prematurely partition. Start simple, measure, then optimize.

---

# 21. Precompute Expensive Analytics

Do not recalculate opportunity scores when the dashboard loads.

Avoid:

```text
Browser request
  ↓
90 days of sales
× a dozen menu items
× hundreds of trends
× financial model
  ↓
response
```

Prefer:

```text
background job (job-ingest-trends, job-generate-opportunities)
      ↓
trend normalization
      ↓
matching → scoring → economics
      ↓
opportunities + opportunity_evidence
      ↓
fast frontend SELECT
```

Then the dashboard runs something trivial:

```sql
select *
from opportunities
where restaurant_id = $1
  and status = 'new'
order by overall_score desc
limit 20;
```

Guiding principle:

> Compute asynchronously. Read synchronously.

This is also why the score columns on `opportunities` are **deliberate denormalized snapshots** of values from `trends` and `menu_items`. That is not a normalization mistake to be refactored into a join. A recommendation shown in September must still explain itself in October, after the trend has faded and the menu price has changed. `scoring_version` is what lets you re-score without destroying the old answer.

---

# 22. Use RLS-Friendly Indexes

RLS predicates run on every tenant query, so their access paths need to be indexed like any other hot query.

`public.owns_restaurant()` resolves `(restaurants.id, owner_id)`. The primary key covers the lookup by `id`; this covers the owner side:

```sql
create index restaurants_id_owner_idx on restaurants (id, owner_id);
create index restaurants_owner_idx    on restaurants (owner_id);
```

More generally, tenant-owned tables should have indexes that **begin with `restaurant_id`**, because that is what both the policy and the application filter on:

```sql
(restaurant_id, status, overall_score desc)
(restaurant_id, sold_at desc)
(restaurant_id, created_at desc)
```

If teams are added later and `owns_restaurant()` starts reading a `restaurant_members` table, that table needs the same treatment:

```sql
create index restaurant_members_user_idx on restaurant_members (user_id);
```

The helper being `stable` matters here too — see principle 23.

---

# 23. Do Not Let `auth.uid()` Be Re-Evaluated Per Row

`auth.uid()` reads a session setting. Its value cannot change during a statement, so PostgreSQL should call it once — but in a naive policy body it may be evaluated for every row scanned.

Two ways to avoid that. This project uses the second.

**Wrap the call in a scalar subquery.** Correct whenever a policy inlines the predicate:

```sql
create policy restaurants_owner_all on restaurants
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
```

**Or put it inside a `stable` function**, which is what the ownership helper does:

```sql
create or replace function public.owns_restaurant(rid uuid)
returns boolean
language sql
stable            -- <- one evaluation per query, not per row
security invoker
set search_path = public
as $$
  select exists (
    select 1 from restaurants r
    where r.id = rid and r.owner_id = auth.uid()
  );
$$;
```

`stable` is the load-bearing keyword. It tells the planner the result cannot change within a statement, so the whole subquery — including `auth.uid()` — is evaluated once per distinct argument rather than once per row.

Because every tenant policy calls the helper, the optimization applies everywhere at once. The `(select auth.uid())` form is still the right pattern for any policy written directly against a column, such as the root `restaurants` policy.

---

# 24. Design Queries Before Designing Indexes

Write down the important queries first. For this product:

**Opportunity feed** — the primary product query.

```sql
where restaurant_id = ? and status = 'new'
order by overall_score desc
```

**Sales history**, for dashboards.

```sql
where restaurant_id = ? and sold_at between ? and ?
```

**One item's history**, for baselines.

```sql
where menu_item_id = ? and sold_at >= ?
```

**Active menu.**

```sql
where restaurant_id = ? and active
```

**Trend history.**

```sql
where trend_id = ? and observed_at >= ?
```

**Ingestion backlog** — "what work is left."

```sql
where processed_at is null
```

**Latest inventory count per ingredient.**

```sql
distinct on (restaurant_id, ingredient_id) ... order by counted_at desc
```

Each of those has exactly one index shaped for it, and two of them justify a partial index rather than a full one:

```sql
create index menu_items_active_idx       on menu_items (restaurant_id) where active;
create index raw_signals_unprocessed_idx on raw_signals (fetched_at)   where processed_at is null;
```

A partial index stays small in proportion to the matching subset rather than the table, which is why "find work to do" remains a fast query in perpetuity.

Do not treat indexes as decoration added after the schema is finished.

---

# 25. Use Migrations From Day One

Do not let the Supabase dashboard be the only record of a schema change.

The migration set maps one-to-one onto the sections of [`schema.md`](./schema.md), and onto the five layers:

```text
supabase/
  migrations/
    0001_enums.sql              enums + pgcrypto + the shared updated_at trigger
    0002_tenancy.sql            layer 1: restaurants
    0003_restaurant_state.sql   layer 2: uploads, menu_items, ingredients,
                                         menu_item_ingredients, inventory_counts, sales
    0004_external_signals.sql   layer 3: ingest_runs, raw_signals, trends, trend_signals
    0005_opportunities.sql      layer 4: opportunities, opportunity_evidence
    0006_activation.sql         layer 5: campaigns, campaign_assets,
                                         experiments, experiment_results
    0007_views.sql              current_inventory, menu_item_daily_sales, menu_item_baselines
    0008_rls.sql                RLS, owns_restaurant(), all policies, storage bucket
  seed.sql
  tests/
```

Two ordering constraints inside that list, both easy to trip over:

- `uploads` is created **first** within `0003`, because `inventory_counts.upload_id` and `sales.upload_id` reference it.
- RLS is last, in one file. Policies reference tables from every layer, and keeping them together means the security model can be read in one sitting instead of reconstructed from eight files.

The schema must be reproducible from Git. `supabase db reset` applies every migration and then the seed, which makes that claim testable rather than aspirational.

**Never edit an applied migration.** A schema change is always a new numbered file. Locally a reset is cheap; hand-editing history breaks the moment anyone else pulls.

---

# 26. Test RLS Like Application Code

Multi-tenancy security should have automated tests. A tenant isolation failure is not a normal frontend bug — it is the failure that ends the product.

At minimum, verify:

```text
Tenant A can read tenant A's data           ✅
Tenant A cannot read tenant B's data        ✅
Tenant A can write tenant A's data          ✅
Tenant A cannot write onto tenant B         ✅
Tenant A's blind UPDATE changes nothing     ✅
Anonymous users can read nothing            ✅
Shared tables are readable, not writable    ✅
Internal tables are invisible               ✅
```

Two requirements that make these tests real rather than reassuring:

**The seed must contain two tenants.** Isolation cannot be tested with one, and asserting against an empty other side proves nothing.

**Tests must run as a real role with a real claim.** `postgres` bypasses RLS entirely and passes everything:

```sql
select set_config('request.jwt.claims',
  json_build_object('sub', <user_id>, 'role', 'authenticated')::text, true);
set local role authenticated;
-- assertions here
reset role;
```

Two subtleties worth encoding in the tests. First, a cross-tenant `update` or `delete` does **not** raise — `using` filters the rows away and the statement succeeds affecting nothing. So the assertion has to be "did tenant B's data change," not "did the statement fail." Second, an `insert` onto another tenant *does* raise (`42501`), because that is `with check` rejecting the row.

`supabase/tests/03_rls.test.sql` covers all of the above. Run the suite with `supabase test db`.

---

# 27. Plan for Connection Pooling When Workers Scale

A small application can connect to PostgreSQL directly without much thought.

Later, background jobs and serverless functions create many short-lived connections.

Avoid:

```text
hundreds of workers
     ↓
hundreds of independent DB connections
     ↓
PostgreSQL
```

Use Supabase's pooler for high-concurrency serverless workloads, and keep application-side pools intentionally small in horizontally scaled environments.

For the MVP this is a non-issue and the pooler is disabled in `config.toml`. There are six Edge Functions and two jobs triggered manually. Note it as the thing to turn on before scheduling jobs on a cron and running them concurrently, not as something to configure now.

---

# 28. Avoid Premature Infrastructure

Do not add infrastructure because a large system might eventually need it. PostgreSQL + Supabase is enough for this MVP.

Do not add:

- MongoDB — the data is relational; menu items have ingredients, opportunities join trends to items
- Redis — materialized views and summary tables cover anything genuinely expensive
- Kafka or an event bus — `raw_signals.processed_at is null` with a partial index *is* the queue, and it is durable, inspectable, and free
- Kubernetes or microservices — six Edge Functions and a database
- custom authentication — Supabase Auth integrates with RLS; rolling your own is how tenant data leaks
- a distributed cache

These are not deferred. They should never enter this project. Each solves a scale or coupling problem it does not have, while adding a failure mode it would then own.

Scale based on measured bottlenecks:

```text
normal PostgreSQL table
        ↓
measure slow query
        ↓
EXPLAIN (ANALYZE, BUFFERS)
        ↓
add or change an index
        ↓
precompute if needed
        ↓
partition only if truly necessary
```

---

# 29. Future Scalability Strategy

Scaling should happen in stages rather than through one large rewrite. When performance degrades, work in this order:

```text
measure
  ↓
fix slow queries / N+1 queries
  ↓
add or improve indexes
  ↓
precompute expensive aggregates
  ↓
cache repeated reads
  ↓
scale database compute / connection pooling
  ↓
move analytical reads to read replicas
  ↓
archive cold data
  ↓
partition very large tables
  ↓
shard only if a single primary is no longer practical
```

Do not jump to distributed infrastructure because a table is growing. PostgreSQL should remain the source of truth for as long as it comfortably supports the workload.

---

# 30. Caching Strategy

Caching should reduce repeated expensive work, not hide poorly designed queries.

## Level 1: PostgreSQL's built-in caching

PostgreSQL and the OS already cache frequently accessed pages. Do not add a cache merely because the application performs reads. Make the queries and indexes efficient first.

## Level 2: Precomputed database results

For this application, precomputation is usually more useful than a generic cache.

The MVP does this with three views, so the arithmetic has one definition:

```text
inventory_counts  →  current_inventory        (latest count per ingredient)
sales             →  menu_item_daily_sales    (local-day buckets, day_of_week projected)
                  →  menu_item_baselines      (28-day trailing, per weekday)
```

Views recompute on read, which is correct at demo scale and keeps the numbers exact. When `sales` grows enough that `menu_item_daily_sales` becomes slow, the next step is a summary table written by a nightly job:

```sql
create table daily_sales_summary (
  restaurant_id uuid   not null references restaurants(id) on delete cascade,
  business_date date   not null,
  revenue       numeric(12,2) not null,
  order_count   integer not null,
  item_count    integer not null,

  primary key (restaurant_id, business_date)
);
```

Two things to carry over when that day comes: `business_date` must be computed with `at time zone restaurants.timezone`, and the summary must be additive so a re-run for one date is idempotent.

`opportunities` is itself the largest precomputation in the system — an entire scoring pipeline collapsed into rows the dashboard can sort.

## Level 3: Client / API cache

Cache stable or frequently repeated reads at the application layer.

Good candidates:

- restaurant profile data
- menu configuration
- global trend descriptions
- the opportunity feed, refreshed periodically
- historical summary charts

Poor candidates:

- authorization decisions
- financial writes
- anything that must be immediately consistent after an update

Starting points, not requirements:

```text
restaurant configuration:    5-30 minutes
menu data:                    1-5 minutes
opportunity feed:             1-5 minutes
historical analytics:         5-30 minutes
live write confirmation:      no stale cache
```

## Level 4: Distributed cache

Do **not** add Redis to the MVP. Consider a dedicated cache only when metrics show that the same expensive reads occur extremely frequently, database CPU is being consumed by repeated identical work, precomputation does not solve it, and invalidation rules are understood.

If one is ever introduced, every tenant-specific cache key must include the tenant:

```text
restaurant:{restaurant_id}:opportunities:v2
```

Never let tenant data share an ambiguous cache key.

---

# 31. Data Retention Policy

Not every kind of data needs to stay in the primary database forever. Define retention by the value of the data and how often it is queried.

A reasonable starting policy for this product, to be adjusted against real product, customer, and legal requirements:

| Data | Initial approach | Long-term approach |
|---|---|---|
| `restaurants`, `menu_items`, `ingredients`, `menu_item_ingredients` | keep while the tenant is active | keep until deletion requirements apply |
| `sales` detail | keep in the primary DB | keep recent history hot; archive older detail if scale requires |
| Daily/monthly sales aggregates | keep long-term | compact and useful for modeling |
| `inventory_counts` | keep; append-only history is cheap | aggregate to weekly snapshots if it grows |
| `raw_signals` | **7–30 days** unless needed | delete, or move to object storage |
| `trend_signals` | 90–180 days hot | aggregate or archive older observations |
| `trends` | keep long-term | useful for historical trend modeling |
| `ingest_runs` | 30–90 days | job telemetry; delete after that |
| `uploads` rows | keep while the source data is hot | needed to reverse an import by `upload_id` |
| `opportunities`, `opportunity_evidence` | keep long-term | product history and training signal |
| `campaigns`, `campaign_assets`, `experiments` | keep long-term | core evidence of business impact |
| `experiment_results` | keep long-term | compact and strategically valuable |

`raw_signals` has the shortest retention and the fastest growth, which is exactly why the landing table is separate. Deleting it costs nothing downstream: `trend_signals.raw_signal_id` is `on delete set null`, so the normalized signal survives with its provenance link cleared.

There is one ordering rule:

```text
RAW DATA        → expensive, noisy, often short-lived
NORMALIZED DATA → useful operational history
AGGREGATES      → compact, valuable long-term history
```

**Do not delete detailed data before generating the aggregates the product needs.** Deleting `raw_signals` before normalizing them means the evidence is gone; deleting `sales` detail before writing daily summaries means the baselines are gone.

---

# 32. Hot, Warm, and Cold Data

Treat data according to how often it is accessed.

```text
HOT
recent + frequently queried
PostgreSQL, heavily indexed

    ↓

WARM
older but occasionally queried
PostgreSQL with fewer query paths, or compact aggregates

    ↓

COLD
rarely queried historical/raw data
object storage, compressed

    ↓

DELETE
once the retention policy permits
```

For `raw_signals`:

```text
0-30 days      full provider payloads, queryable for explainability
>30 days       compressed archive, or deleted once trend_signals exist
```

For `trend_signals`:

```text
0-90 days      full-resolution observations
90-365 days    daily aggregates per (trend_id, source)
>365 days      aggregate-only retention
```

For `sales`:

```text
recent transactions
        ↓
PostgreSQL + daily aggregates
        ↓
older detail may eventually move to archive storage
while aggregates remain queryable
```

Do not move anything to cold storage until there is an actual storage, cost, or performance reason.

---

# 33. Archival Strategy

Cold historical data should leave the primary transactional database long before anyone reaches for sharding.

Good archive candidates:

- old `raw_signals` payloads
- old `ingest_runs` telemetry
- `sales` detail no longer queried interactively

A future archive flow:

```text
PostgreSQL
   ↓
periodic export job
   ↓
Parquet / compressed archive
   ↓
Supabase Storage or another object store
   ↓
verification
   ↓
delete eligible source rows
```

Prefer columnar formats such as Parquet for large analytical archives; they are compact and efficient for later processing.

Verification before deletion is not optional. An unverified export followed by a delete is data loss with extra steps.

**An archive is not a backup.** Backups protect against accidental loss or corruption. Archives reduce how much history the hot database carries.

---

# 34. Compression Policy

Do not manually compress relational columns in application code. PostgreSQL already TOASTs and compresses large field values, and packing queryable fields into an opaque blob makes filtering, indexing, and debugging much harder.

Keep hot relational data queryable:

```text
restaurant_id
menu_item_id
sold_at
quantity
revenue
```

Avoid:

```text
compressed_blob bytea
```

for anything the application regularly queries.

Use compression at the archival boundary instead:

```text
old raw_signals payloads
    ↓
Parquet + compression
    ↓
object storage
```

For large `jsonb` payloads that are rarely queried — `raw_signals.payload` is the only one here — first ask whether they belong in PostgreSQL at all.

A useful rule:

> If the application needs to filter, join, or aggregate the data frequently, keep it structured in PostgreSQL. If it is retained mostly for historical reference or reprocessing, object storage is often a better long-term home.

---

# 35. Automated Retention Jobs

Retention should eventually be automated rather than depending on manual cleanup.

The MVP triggers jobs manually, which is genuinely better for a demo — you control exactly when new data appears. Scheduling is a documented one-hour extension ([`extensibility.md`](./extensibility.md#scheduling-the-jobs)), not a missing feature.

When it goes on:

```text
every night
  → aggregate yesterday's trend_signals

weekly
  → delete raw_signals older than the retention window

monthly
  → identify archive-eligible sales detail
```

Two requirements before enabling any schedule:

**Jobs must be idempotent.** `raw_signals (source, source_id)` guarantees this for ingestion and `opportunities_unique_pairing` guarantees it for scoring, so the groundwork is already in place.

**Jobs must be bounded.** Edge Functions have execution time limits, and a cleanup job that tries to delete tens of millions of rows in one transaction will fail in the worst possible way.

Prefer batches:

```text
delete 10,000 eligible rows
commit
repeat on the next invocation
```

Large deletions create write load, WAL volume, vacuum work, and index bloat. Store any cron secret in Vault rather than inline in the schedule definition.

---

# 36. Partitioning Strategy

Partition only tables that become genuinely large and are naturally separable.

Likely future candidates:

```text
sales
raw_signals
trend_signals
```

Do not partition:

```text
restaurants
menu_items
ingredients
campaigns
opportunities
```

## Prefer time-based partitioning first

For append-heavy historical tables, time is the cleanest first partition key:

```text
sales
├── sales_2027_01
├── sales_2027_02
└── ...
```

or quarterly at lower volume.

Benefits: partition pruning for time-range queries, cheaper removal or archival of old data, smaller per-partition indexes, and manageable maintenance.

Tenant filtering still happens on `restaurant_id` inside each partition, so index shapes do not change:

```sql
(restaurant_id, sold_at desc)
```

## Do not partition by tenant by default

One partition per restaurant becomes operationally ugly as tenant counts grow. A product with 20,000 restaurants should not casually create 20,000 partitions. Use tenant partitioning only if measured access patterns strongly justify it.

## Revisit partitioning when

There is no universal row-count threshold. Consider it when several of these are true:

- a high-volume table has tens or hundreds of millions of rows
- indexes are becoming expensive to maintain
- most queries target a narrow time range
- retention deletes are expensive
- autovacuum pressure is significant
- plans repeatedly scan data outside the requested window

Partition because measurements justify it, not because the application might get large someday.

---

# 37. Read Scaling and Read Replicas

Before sharding, separate read pressure from write pressure.

The primary should prioritize:

```text
INSERT / UPDATE / DELETE
latency-sensitive reads
```

Analytical and reporting workloads can move to a replica:

```text
Primary PostgreSQL
   │
   ├── application writes
   ├── current operational reads
   │
   └── asynchronous replication
             ↓
        Read Replica
             │
             ├── historical dashboards
             ├── reporting
             ├── trend analysis
             └── model feature extraction
```

Supabase read replicas are asynchronous, so replication lag is possible. Do not use a replica for anything requiring read-after-write consistency.

Good replica candidates: historical analytics, long-range reporting, trend analysis, offline scoring jobs.

Poor candidates: displaying a newly created campaign, authorization checks, anything that depends on the latest transaction being visible immediately.

For this product the natural first split is job workload versus user workload. `job-generate-opportunities` reads 90 days of sales across every menu item; that is exactly the read that should eventually not compete with someone loading a dashboard.

---

# 38. Sharding Strategy

Do not shard the MVP. Do not shard merely because the product is multi-tenant.

A well-indexed PostgreSQL database with pooling, precomputation, archival, partitioning, and read replicas supports a substantial workload long before sharding is necessary.

If it is ever required, `restaurant_id` is the tenant placement key:

```text
hash(restaurant_id)
        ↓
Shard A
Shard B
Shard C
```

This preserves tenant affinity — one restaurant's menu, sales, campaigns, opportunities, and experiments live together — which minimizes cross-shard joins.

Note that layer 3 does not shard on that key at all. `trends`, `trend_signals`, `raw_signals`, and `ingest_runs` are global, so they would need to be replicated to every shard or kept in a separate cluster. That awkwardness is a feature of the layer boundary, not a flaw in it: it surfaces early which data is shared, rather than discovering it during a migration.

A sharding boundary must be hidden behind the backend API, never exposed to frontend clients.

## Consider sharding only when

- a single primary cannot meet write throughput
- database size makes maintenance or recovery unreasonable
- one region cannot satisfy latency or isolation needs
- vertical scaling is no longer economical
- replicas cannot help because writes are the limit
- a few extremely large tenants require physical isolation

Sharding adds routing, migrations, cross-shard analytics, backups, tenant movement, tooling, and global uniqueness problems. Treat it as a late-stage decision.

---

# 39. Connection Scaling

Connection exhaustion often arrives before CPU or storage becomes the bottleneck.

Serverless functions and horizontally scaled workers create many short-lived connections. Use Supabase's pooler for those workloads rather than unrestricted direct connections:

```text
Browser / Edge Functions / jobs
             ↓
      connection pooler
             ↓
         PostgreSQL
```

Monitor: active connections, pooler client connections, query duration, database CPU, memory, lock waits.

Do not solve connection pressure by increasing every pool size. Leave capacity for Supabase-managed services and administrative access — locking yourself out of your own database while debugging a load problem is a bad afternoon.

---

# 40. Backups and Recovery

Retention and archival do not replace backups.

Define explicit recovery objectives before production:

```text
RPO = how much recent data can we afford to lose?
RTO = how long can recovery take?
```

For an early MVP, daily backups may be sufficient. As the product starts processing real customer transactions and campaign results, evaluate Point-in-Time Recovery so the database can be restored close to a specific failure time.

Three separate systems, often confused:

```text
RETENTION   controls how long data is intentionally kept
ARCHIVAL    moves rarely used history out of hot storage
BACKUP      protects against unintended loss or corruption
```

Database backups and object-storage backups are also separate concerns. Archived Parquet files in Supabase Storage need their own durability strategy; they are not covered by a Postgres backup.

---

# 41. Performance Observability

Do not make scaling decisions from row counts. Track actual bottlenecks.

At minimum:

```text
p50 / p95 / p99 query latency
database CPU
memory pressure
active connections
connection pool utilization
slow queries
index hit/read behaviour
lock waits
database size
index size
rows inserted per day
storage growth per month
replication lag, if replicas exist
background job duration
```

Two product-specific signals worth watching alongside the generic ones:

```text
ingest_runs.fetched_count vs new_count     -- unstable source_id inflating trend scores
count(*) where processed_at is null        -- the normalization backlog
```

Both are read straight out of tables that already exist. Job health is queryable, not something to infer from logs.

For important queries, periodically run:

```sql
EXPLAIN (ANALYZE, BUFFERS)
```

The goal is to answer:

> What resource is actually limiting us?

before changing the architecture.

---

# 42. Suggested Scale Decision Matrix

Architectural defaults, not production limits.

| Concern | MVP decision | Revisit when |
|---|---|---|
| Application cache | client/query cache only | repeated reads materially load the DB |
| Redis / distributed cache | do not use | precomputation + DB optimization are insufficient |
| Analytics | three views | views become slow; then a summary table |
| Scheduled jobs | manual triggers | a demo no longer needs manual control |
| Connection pooling | disabled | jobs run concurrently or on a schedule |
| Read replicas | none | job reads materially compete with dashboard reads |
| `raw_signals` retention | 7–30 days hot | debugging or reprocessing needs justify longer |
| `trend_signals` retention | 90–180 days hot | storage growth or model needs suggest change |
| `sales` detail | keep hot | storage or query cost justifies archival |
| Aggregate sales history | keep long-term | usually cheap and strategically valuable |
| Compression | archive files, not hot rows | cold history becomes large |
| Partitioning | none | very large append tables show measurable pain |
| Sharding | none | primary write limits remain after simpler steps |
| PITR | evaluate for production | customer data becomes costly to recreate |
| `pgvector` matching | keyword + tag overlap | keyword matching visibly misses good pairings |

---

# 43. Storage Growth Review

Establish a recurring growth review before it becomes an emergency.

Track approximately:

```text
rows/day for sales
rows/day for raw_signals and trend_signals
bytes per restaurant per month
database GB/month
index GB/month
object storage GB/month
```

A monthly or quarterly review should ask:

1. Which tables are growing fastest?
2. Which indexes consume the most space?
3. Which data has not been queried recently?
4. Which raw data can be aggregated or archived?
5. Are retention jobs keeping up?
6. Are dashboards reading summary views rather than raw history?
7. Are background jobs creating duplicate rows — is `new_count` tracking `fetched_count`?
8. Is a small number of tenants responsible for disproportionate growth?

This turns scalability from a future rewrite into routine maintenance.

---

# Recommended Application Shape

```text
auth.users
     │  owner_id
     ▼
restaurants                                    ← layer 1: tenancy
     │
     ├── uploads ─────────────────────┐         ← layer 2: restaurant state
     │                                │
     ├── menu_items ── menu_item_ingredients ── ingredients
     │        │                                      │
     │        └── sales ◄────────────────────────────┴── inventory_counts
     │
     ├── opportunities ── opportunity_evidence  ← layer 4: decision
     │
     ├── campaigns ── campaign_assets           ← layer 5: activation
     │
     └── experiments ── experiment_results


GLOBAL / SHARED READ                            ← layer 3: external world
────────────────────

trends
   │
   └── trend_signals


INTERNAL (service role only)
────────────────────────────

ingest_runs
   │
   └── raw_signals


WHERE THE TWO SIDES MEET
────────────────────────

restaurants + menu_items  ×  trends
                  │
                  ▼
            opportunities
```

Layers 2 and 3 never reference each other. Restaurant data knows nothing about trends; trend data knows nothing about restaurants. They meet only in layer 4, which is what lets a trend source or a POS integration be swapped independently.

---

# Suggested Core Indexes

The ones the implementation actually creates, and what each is for.

```sql
-- ownership predicate, called by every tenant policy
create index restaurants_owner_idx    on restaurants (owner_id);
create index restaurants_id_owner_idx on restaurants (id, owner_id);

-- active menu, and the matching substrate
create index menu_items_active_idx on menu_items (restaurant_id) where active;
create index menu_items_tags_idx   on menu_items using gin (tags);
create unique index menu_items_name_key on menu_items (restaurant_id, lower(trim(name)));

-- the two real sales query shapes
create index sales_restaurant_time_idx on sales (restaurant_id, sold_at desc);
create index sales_item_time_idx       on sales (menu_item_id, sold_at desc);
create index sales_upload_idx          on sales (upload_id);

-- latest inventory count per ingredient
create index inventory_counts_latest_idx
  on inventory_counts (restaurant_id, ingredient_id, counted_at desc);

-- the ingestion backlog: this is the queue
create index raw_signals_unprocessed_idx on raw_signals (fetched_at) where processed_at is null;
create index raw_signals_source_time_idx on raw_signals (source, fetched_at desc);

-- trend ranking and matching
create index trends_ranked_idx   on trends (status, trend_score desc);
create index trends_keywords_idx on trends using gin (keywords);
create unique index trends_slug_region_key on trends (slug, coalesce(region, '*'));

-- trend history, and the local_relevance component
create index trend_signals_trend_time_idx on trend_signals (trend_id, observed_at desc);
create index trend_signals_source_idx     on trend_signals (trend_id, source);

-- the primary product query
create index opportunities_ranked_idx on opportunities (restaurant_id, status, overall_score desc);
create unique index opportunities_unique_pairing
  on opportunities (restaurant_id, trend_id, menu_item_id, scoring_version) nulls not distinct;
```

Always validate an index against a real query plan before adding more of them.

---

# Table Classes

Tenant-owned. Every one of these carries `restaurant_id`, or reaches it through a parent.

```text
restaurants
menu_items
ingredients
menu_item_ingredients        (via menu_items)
inventory_counts
sales
uploads
opportunities
opportunity_evidence         (via opportunities)
campaigns
campaign_assets              (via campaigns)
experiments
experiment_results           (via experiments)
```

Shared read-only. No `restaurant_id`, readable by every authenticated user, writable only by the service role.

```text
trends
trend_signals
```

Internal. No `restaurant_id`, RLS enabled with zero policies.

```text
raw_signals
ingest_runs
```

Seventeen tables and three views. If a new table does not fit cleanly into one of these three classes, that is a design question to answer before writing the migration.

---

# Pre-Merge Backend Checklist

Before approving a database change:

- [ ] Does every tenant-owned row have a `restaurant_id`, or a parent that does?
- [ ] Is RLS enabled on the new table, and does it fall into exactly one of the three access classes?
- [ ] Does every tenant policy call `public.owns_restaurant()` rather than inlining the predicate?
- [ ] Does every policy have **both** `using` and `with check`?
- [ ] Is any new view declared `with (security_invoker = on)`?
- [ ] Are common foreign keys and tenant query paths indexed?
- [ ] Are unique constraints scoped to their real namespace, and functional where CSV upserts depend on it?
- [ ] Are core product fields typed columns rather than JSON blobs, with enums for closed value sets?
- [ ] Is raw provider data isolated from normalized product data?
- [ ] Are ingestion jobs idempotent, with a `source_id` that is stable across runs?
- [ ] Are database constraints protecting the important invariants?
- [ ] Is money `numeric`, never floating point?
- [ ] Are `*_score` columns 0–100 and `*_rate` columns decimal fractions?
- [ ] Are timestamps `timestamptz`, and does every day-bucketing query convert with `at time zone`?
- [ ] Are expensive calculations precomputed rather than run on every request?
- [ ] Are RLS policies tested across two separate tenants, as a real role with a real claim?
- [ ] Is privileged Supabase access restricted to `job-*` functions?
- [ ] Is the change a new numbered migration rather than an edit to an applied one?
- [ ] Does new high-volume data have a defined retention expectation?
- [ ] Is tenant-specific cached data keyed by `restaurant_id`?
- [ ] Does this change increase connection pressure or background-job load?
- [ ] Are partitioning or sharding being introduced only because measured load justifies them?

---

# MVP Priority

For the current hackathon / MVP, in this order:

1. `restaurants` with `owner_id`
2. `restaurant_id` on every tenant-owned table
3. RLS on every table, three access classes, one `owns_restaurant()` helper
4. tenant-scoped indexes leading with `restaurant_id`
5. `numeric` money, `numeric(5,2)` scores, `numeric(6,4)` rates
6. `timestamptz` everywhere, day bucketing via `restaurants.timezone`
7. relational product data, enums for closed sets, `jsonb` only for provider payloads
8. `raw_signals` separate from `trends` / `trend_signals`, with `(source, source_id)` unique
9. idempotent ingestion, reversible imports via `uploads`
10. migrations in source control, `0001`–`0008`
11. seed data that exercises the whole pipeline, including two tenants
12. RLS tests across those two tenants
13. precomputed opportunities instead of on-request scoring
14. explicit retention expectations for `raw_signals` and `trend_signals`
15. basic monitoring of query latency, connections, and storage growth

Everything else evolves as real load and product requirements become clear.

The goal is not to architect for millions of restaurants today.

The goal is to make sure the path from **10 restaurants → 10,000 restaurants** does not require rebuilding the foundation.
