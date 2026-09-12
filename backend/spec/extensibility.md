# Extensibility

How hard is it to add each thing we deliberately left out? This document answers that concretely, so scope decisions are made with real numbers instead of optimism.

Read [`architecture.md`](./architecture.md) first — the layer boundaries described there are what make everything below cheap.

## Cost summary

| Extension | Effort | Migration? | Files touched | Breaks anything? |
|---|---|---|---|---|
| [New trend source](#adding-a-trend-source) | ~1–2 h | 1 line (enum) | 1 new adapter | No |
| [Change scoring weights](#retuning-the-scoring-model) | ~10 min | No | 1 constants object | No |
| [New score component](#adding-a-score-component) | ~2–3 h | Add columns | 2 | No |
| [New CSV upload kind](#adding-a-csv-upload-kind) | ~1–2 h | 1 line + table | 2 | No |
| [New ad channel](#adding-an-ad-channel) | ~30 min | 1 line (enum) | 1 | No |
| [`pgvector` matching](#upgrading-to-embedding-matching) | ~4–6 h | Extension + column | 1 | No |
| [Scheduled jobs](#scheduling-the-jobs) | ~1 h | Enable `pg_cron` | 0 | No |
| [Multi-user restaurants](#multi-user-restaurants) | ~4–6 h | New table + all policies | ~2 + policies | **Yes** — RLS rewrite |
| [Live POS integration](#live-pos-integration) | ~2–4 days | Small | ~4 new | No |
| [Statistical significance](#statistical-significance) | ~4–6 h | Add columns | 1 | No |
| [Python service](#swapping-in-a-python-service) | ~1–2 days | No | New deploy target | No |
| [Multi-region / multi-location](#multi-location-restaurant-groups) | ~1 week | Structural | Many | **Yes** |

The pattern worth noticing: everything is cheap except the two things that change the shape of ownership. Tenancy is the one decision that is expensive to revisit, which is why [multi-user](#multi-user-restaurants) is called out explicitly rather than assumed.

## Adding a trend source

**Effort: 1–2 hours. The most common extension, and the cheapest.**

The pipeline's first two stages are split precisely so this stays easy. An adapter's only job is to fetch and hand back raw records; it never touches `trends`, scoring, or restaurants.

Every adapter implements one signature:

```ts
// _shared/domain/adapters/types.ts
export type RawRecord = {
  sourceId: string;        // provider's own stable ID -> raw_signals.source_id
  observedAt: string;      // ISO 8601
  region?: string;
  query?: string;
  payload: unknown;        // untouched provider response
};

export type TrendAdapter = {
  source: SignalSource;
  fetch(opts: { region?: string; since?: string }): Promise<RawRecord[]>;
};
```

To add Yelp:

1. `alter type signal_source add value 'yelp';` — one line, no table rewrite.
2. Create `_shared/domain/adapters/yelp.ts` implementing `TrendAdapter`.
3. Register it in the adapter map in `job-ingest-trends/index.ts`.
4. Add the API key to Edge Function secrets.

Nothing else changes. Normalization, scoring, and economics never learn that Yelp exists, because they only read `raw_signals` and `trend_signals`.

**The one rule that matters: `sourceId` must be stable across runs.** It is half of `raw_signals`' unique key, so a stable ID makes re-ingestion free and idempotent, while an unstable one (a timestamp, an array index, a hash of mutable text) silently re-inserts the same evidence on every run and inflates trend scores without any error appearing anywhere. When a provider gives you a real ID, use it. When it does not — Google Trends returns a series, not documents — synthesize deterministically from immutable inputs:

```ts
const sourceId = `${query}:${region}:${isoWeek}`;   // stable
const sourceId = `${query}:${Date.now()}`;          // WRONG: new ID every run
```

Watch `ingest_runs.new_count`. If it equals `fetched_count` on every run for a source that should be seeing repeat content, the `sourceId` is unstable.

## Retuning the scoring model

**Effort: 10 minutes for weights. No migration.**

All weights and thresholds live in one exported object:

```ts
// _shared/domain/scoring.ts
export const SCORING_V1 = {
  version: 'v1',
  weights: {
    trendStrength:   0.25,
    localRelevance:  0.15,
    menuFit:         0.20,
    operationalFit:  0.15,
    profitability:   0.25,
  },
  thresholds: {
    minMenuSimilarity:     0.30,
    minOverallToPersist:   50,
    neutralOperationalFit: 60,
  },
} as const;
```

Change a number, redeploy. Two safeguards to keep:

- **Assert the weights sum to 1.0 in a unit test.** Otherwise a typo (`0.20` → `0.02`) yields scores that are wrong but still inside 0–100, so every check constraint passes and nothing looks broken.
- **Bump `version` when weights change**, and write new rows rather than updating old ones. Because `opportunities.scoring_version` is part of the unique index, `v1` and `v2` rows coexist for the same pairing, so you can compare models on real data and roll back by changing which version the frontend reads.

## Adding a score component

**Effort: 2–3 hours. Additive migration.**

Say you want a `seasonality_score` — is this trend arriving at the right time of year?

1. Add the column: `alter table opportunities add column seasonality_score numeric(5,2) check (seasonality_score >= 0 and seasonality_score <= 100);` Nullable, so existing rows stay valid.
2. Add a `seasonality` case to `evidence_type`.
3. Write the component function in `scoring.ts` and add its weight to `SCORING_V2`, rebalancing the others to sum to 1.0.
4. Emit an evidence row so the new component is explainable like every other one.
5. Re-score under `v2`.

The cost stays low because the component functions are pure and independent — each takes plain data and returns a 0–100 number, so adding one cannot perturb the others.

## Adding a CSV upload kind

**Effort: 1–2 hours.**

Suppose you want `labor.csv` to factor staffing cost into `operational_fit`.

1. `alter type upload_kind add value 'labor';`
2. Create the destination table following the `inventory_counts` pattern — append-only, `restaurant_id`, an `upload_id` back-reference, RLS policy copied verbatim.
3. Add a header spec and row handler to the `uploads` function's dispatch map.

The `uploads` table itself needs no changes: status tracking, row counts, structured errors, and reversal-by-`upload_id` all work for any kind. That is the payoff for making uploads a first-class table instead of a fire-and-forget parse.

## Adding an ad channel

**Effort: 30 minutes.**

`alter type campaign_channel add value 'google_ads';` then add a prompt template and length limit for it in the asset generator. Because `campaign_assets` is a child table keyed on `(campaign_id, channel, variant_label)`, a new channel is just new rows — no schema change beyond the enum value, and existing campaigns are unaffected.

This is the direct payoff for splitting assets out of `campaigns.content`. Under the original single-text-column design, supporting a second channel would have required a migration and a rewrite of everything reading campaign copy.

## Upgrading to embedding matching

**Effort: 4–6 hours. The highest-value upgrade after the MVP works.**

Keyword matching cannot see that "burrata" relates to "fresh mozzarella," or that "chili crisp" belongs on wings. Embeddings can. Stage ③ is isolated in `_shared/domain/matching.ts` specifically so this swap touches one file.

1. Enable the extension: `create extension if not exists vector;` (available on Supabase by default).
2. Add embedding columns:

```sql
alter table menu_items add column embedding vector(1536);
alter table trends     add column embedding vector(1536);

create index menu_items_embedding_idx on menu_items
  using hnsw (embedding vector_cosine_ops);
create index trends_embedding_idx on trends
  using hnsw (embedding vector_cosine_ops);
```

3. Backfill embeddings from `name || description || category || tags` for menu items, and `name || description || keywords` for trends. Regenerate on update.
4. Add a matching RPC:

```sql
create or replace function public.match_menu_items(
  p_restaurant_id uuid,
  p_trend_embedding vector(1536),
  p_limit int default 5
)
returns table (menu_item_id uuid, similarity numeric)
language sql stable
as $$
  select mi.id, (1 - (mi.embedding <=> p_trend_embedding))::numeric(4,3)
  from menu_items mi
  where mi.restaurant_id = p_restaurant_id
    and mi.active
    and mi.embedding is not null
  order by mi.embedding <=> p_trend_embedding
  limit p_limit;
$$;
```

5. Point `matching.ts` at the RPC, keeping keyword matching as the fallback when an embedding is missing.

Nothing downstream changes, because `menu_fit_score` still consumes a 0–1 similarity — it does not care where the number came from. Use HNSW rather than IVFFlat; it needs no training step and performs better at the scale this project will see for a long time.

## Scheduling the jobs

**Effort: 1 hour.**

The MVP triggers jobs manually, which is genuinely better for a demo — you control exactly when new data appears. To automate:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'ingest-trends-daily',
  '0 8 * * *',
  $$
  select net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/job-ingest-trends',
    headers := '{"Authorization": "Bearer <service-role-key>", "Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
```

Two requirements before turning this on. The jobs must be **idempotent** — running twice must not double-count, which `raw_signals`' unique key already guarantees for ingestion and the `opportunities` unique index guarantees for scoring. And they must be **bounded**, processing at most N unprocessed signals per invocation, since Edge Functions have execution time limits. Store the cron secret in Vault rather than inline in the schedule definition.

## Multi-user restaurants

**Effort: 4–6 hours, and the only extension here that requires rewriting existing code.**

The MVP is deliberately single-owner: `restaurants.owner_id` is one user, and there are no teams, roles, or invitations. Real restaurants have an owner, a GM, and a chef who all want access, so this will come up. It is documented rather than pre-built because the join table plus role checks plus invitation flow is real work that buys nothing during a demo.

The migration:

```sql
create type restaurant_role as enum ('owner', 'manager', 'staff');

create table restaurant_members (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          restaurant_role not null default 'staff',
  invited_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);

create index restaurant_members_user_idx on restaurant_members (user_id);

-- backfill existing owners
insert into restaurant_members (restaurant_id, user_id, role)
select id, owner_id, 'owner' from restaurants;
```

Then redefine the single helper every policy already calls:

```sql
create or replace function public.owns_restaurant(rid uuid)
returns boolean
language sql stable security invoker
set search_path = public
as $$
  select exists (
    select 1 from restaurant_members m
    where m.restaurant_id = rid and m.user_id = auth.uid()
  );
$$;
```

**This is why the helper exists.** Because every tenant policy in [`schema.md` §8](./schema.md#8-row-level-security) calls `public.owns_restaurant(restaurant_id)` instead of inlining `owner_id = auth.uid()`, membership semantics change in one function and roughly fifteen policies pick it up for free. Had the predicate been inlined, this would be a fifteen-policy rewrite with fifteen chances to miss one and leak data.

Remaining work after the helper swap: add a companion `has_role(rid, role)` for write-restricted operations, keep `restaurants.owner_id` as the billing contact, and build the invitation flow. Note that `restaurant_members` needs its own policy carefully written to avoid recursion — scope it to `user_id = auth.uid()` for reads rather than calling `owns_restaurant`.

## Live POS integration

**Effort: 2–4 days per provider, mostly provider-side.**

CSV upload was chosen over a Toast integration because OAuth, webhook registration, and sandbox credentials consume a hackathon without improving the demo. The schema is already shaped for the real thing.

Adding Toast, Square, or Clover means: an OAuth flow storing tokens in a new `pos_connections` table (encrypted, service-role-only, RLS with zero policies like `raw_signals`); a sync job paginating their orders API; mapping their menu IDs to `menu_items` via a new `external_id` column; and a webhook receiver for near-real-time orders.

`sales` needs almost nothing — add `external_id text` with a unique constraint per restaurant for idempotency, and reuse `channel`. CSV upload should stay working alongside it; restaurants switch POS systems, and manual import is the fallback that makes the product usable on day one.

## Statistical significance

**Effort: 4–6 hours.**

`experiment_results.confidence_score` exists as a column but the MVP fills it with a heuristic based on `observed_days` from `menu_item_baselines`. That is honest for a demo but not defensible to a skeptical operator.

The upgrade is a real two-sample test comparing daily values in the baseline window against the experiment window — Welch's t-test is appropriate since variances differ, or Mann-Whitney U if the daily distributions are visibly non-normal. Add `p_value numeric(6,5)`, `confidence_interval_low`, and `confidence_interval_high` columns, and implement in `_shared/domain/statistics.ts` as pure functions.

Two things to be careful about. Day-of-week matching is mandatory — compare Fridays to Fridays, which `menu_item_daily_sales.day_of_week` already supports; comparing a promotional weekend against a weekday-inclusive baseline manufactures significance out of nothing. And with roughly four observations per weekday in a 28-day window, most results will not reach significance, so report the interval and say so rather than dressing up noise. If you need real power, widen the baseline window to 56 or 84 days.

The `experiments_no_overlap` check constraint already prevents the error that would invalidate any test: a baseline window contaminated by the campaign's own lift.

## Swapping in a Python service

**Effort: 1–2 days. Documented escape hatch, not a plan.**

The MVP is Edge Functions only. Reach for Python only when you hit a concrete wall: a scraping library with no Deno equivalent, statistical or ML work that genuinely needs SciPy or pandas, or a job that cannot finish inside an Edge Function's time limit.

The move is cheap because `_shared/domain/` is pure — no I/O, no environment access, plain data in and out. Those are the only modules with logic worth porting; everything else is Supabase glue that a Python client replaces directly.

Deploy FastAPI on Fly.io or Railway, connect with the service role key, port only the specific `_shared/domain` modules you need, and point the relevant job at the new service. Keep Supabase Auth and RLS as the authorization boundary — the Python service holds the service role key, so it must do its own ownership checks. Do not split reads across two systems; the frontend should keep talking to PostgREST.

**Do not port the whole backend.** Move one stage, keep the boundary, and leave everything else where it is.

## Multi-location restaurant groups

**Effort: about a week. Structural, and the most expensive item here.**

A group with eight locations wants per-location menus and sales, plus rolled-up reporting. This is not a small change: it inserts a new level above `restaurants` and rewrites every ownership predicate and every aggregate query.

The shape is a `restaurant_groups` table, `restaurants.group_id`, ownership moving to the group, and rollup views over locations. Trends and opportunities probably stay per-location, since a Houston location and a Dallas location face different local markets — which is the interesting product question hiding inside the technical one.

If multi-location is on the roadmap within the next few months, do it *before* [multi-user](#multi-user-restaurants), because doing tenancy twice is significantly worse than doing it once at the right level.

## Things that stay out permanently

Not "later" — these should never enter this project:

**MongoDB.** The data is relational: menu items have ingredients, opportunities join trends to items, experiments compare time windows. Postgres with foreign keys and check constraints is the correct tool.

**Redis.** Postgres handles this workload without a cache, and materialized views cover anything genuinely expensive. A cache adds an invalidation problem you do not have.

**Kafka or an event bus.** Job volume is a handful of runs per day. `raw_signals.processed_at is null` with a partial index *is* the queue, and it is durable, inspectable, and free.

**Kubernetes or microservices.** Six Edge Functions and a database. Splitting this into services would multiply the operational surface without removing any coupling.

**Custom authentication.** Supabase Auth handles sessions, password resets, OAuth, and JWT verification, and it integrates with RLS. Rolling your own is how tenant data leaks.

The common thread: each of these solves a scale or coupling problem this project does not have, while adding a failure mode it would then own. Postgres and Supabase are sufficient well past the point where the product has proven itself.
