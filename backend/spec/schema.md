# Database Schema

Every block below is runnable DDL, ordered so it applies cleanly top to bottom. Conventions (types, score scales, naming, deletion behavior) are defined once in [`architecture.md` §5](./architecture.md#5-conventions) and are not repeated here.

Migration files map to the sections of this document:

```text
0001_enums.sql              §1
0002_tenancy.sql            §2
0003_restaurant_state.sql   §3
0004_external_signals.sql   §4
0005_opportunities.sql      §5
0006_activation.sql         §6
0007_views.sql              §7
0008_rls.sql                §8
```

## 0. Prerequisites

```sql
create extension if not exists pgcrypto;   -- gen_random_uuid()
```

Shared `updated_at` trigger, used only by tables users edit directly:

```sql
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
```

## 1. Enums

Fixed value sets are real types, not `text`. Postgres then rejects a typo at insert time instead of letting `"Instagram"` and `"instagram"` both into the same column.

```sql
-- layer 2: restaurant state
create type sales_channel   as enum ('in_store', 'online', 'doordash', 'ubereats', 'other');
create type upload_kind     as enum ('menu', 'sales', 'inventory');
create type upload_status   as enum ('pending', 'processing', 'succeeded', 'partial', 'failed');

-- layer 3: external world
create type signal_source   as enum ('google_trends', 'reddit', 'tiktok', 'instagram', 'local_events', 'news', 'manual');
create type trend_category  as enum ('food', 'drink', 'ingredient', 'technique', 'social', 'seasonal', 'event', 'local_event');
create type trend_status     as enum ('active', 'fading', 'archived');
create type run_status      as enum ('running', 'succeeded', 'failed');

-- layer 4: decision
create type opportunity_status as enum ('new', 'viewed', 'accepted', 'rejected', 'testing', 'completed');
create type evidence_type      as enum ('trend_growth', 'menu_similarity', 'ingredient_overlap', 'local_relevance', 'margin_impact', 'sales_baseline');

-- layer 5: activation
create type campaign_channel   as enum ('instagram', 'tiktok', 'sms', 'email', 'in_store');
create type campaign_status     as enum ('draft', 'scheduled', 'live', 'paused', 'completed', 'cancelled');
create type experiment_status   as enum ('planned', 'running', 'measuring', 'completed', 'abandoned');
create type target_metric       as enum ('revenue', 'orders', 'menu_item_sales', 'contribution_profit', 'customer_count');
```

Note `campaign_channel` has no `multiple` value. One campaign has many `campaign_assets`, each on exactly one channel — a campaign spanning Instagram and SMS is two assets, which is also what you need anyway since the copy differs per channel.

One tradeoff to know up front: adding an enum value later is trivial (`alter type signal_source add value 'yelp';`), but removing or renaming one requires recreating the type. Add values freely; treat removal as a real migration.

## 2. Layer 1 — Tenancy

```sql
create table restaurants (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,

  name          text not null check (length(trim(name)) > 0),
  description   text,
  cuisine_type  text,
  city          text,
  state         text,
  timezone      text not null default 'America/Chicago',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index restaurants_owner_idx on restaurants (owner_id);

create trigger restaurants_touch
  before update on restaurants
  for each row execute function public.touch_updated_at();
```

`timezone` is not cosmetic. It is the only correct way to bucket sales into days, and every baseline calculation depends on it. Validate it against `pg_timezone_names` at the application layer.

`cuisine_type`, `city`, and `state` are scoring inputs, not just profile decoration — they drive `local_relevance`. A matcha trend detected in Houston is highly relevant to a Japanese bakery there and marginal to a Texas barbecue joint.

## 3. Layer 2 — Restaurant state

### `menu_items`

```sql
create table menu_items (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id) on delete cascade,

  name            text not null check (length(trim(name)) > 0),
  description     text,
  category        text,
  tags            text[] not null default '{}',

  price           numeric(10,2) not null check (price >= 0),
  estimated_cost  numeric(10,2) check (estimated_cost >= 0),

  contribution    numeric(10,2) generated always as (price - estimated_cost) stored,

  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index menu_items_name_key
  on menu_items (restaurant_id, lower(trim(name)));

create index menu_items_active_idx
  on menu_items (restaurant_id) where active;

create index menu_items_tags_idx
  on menu_items using gin (tags);

create trigger menu_items_touch
  before update on menu_items
  for each row execute function public.touch_updated_at();
```

Three deliberate choices:

- The **unique index on `lower(trim(name))`** is what makes CSV upserts safe. Without it, uploading `menu.csv` twice creates `"Wings"` and `"wings "` as separate items, and sales rows then split across both. It has to be a unique *index* rather than a table constraint because it wraps the column in functions.
- **`contribution` is a generated column.** Margin is arithmetic, so the database computes it and it can never drift from `price` and `estimated_cost`. It also gives the scoring stage something to sort by directly.
- **`tags`** with a GIN index is the MVP matching substrate. Seed it from menu text (`chicken`, `fried`, `spicy`, `sandwich`) and it is what keyword matching searches before `pgvector` exists.

### `ingredients`

```sql
create table ingredients (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,

  name           text not null check (length(trim(name)) > 0),
  unit           text not null,                       -- 'lb', 'oz', 'each', 'gal'
  unit_cost      numeric(10,4) check (unit_cost >= 0),

  created_at     timestamptz not null default now()
);

create unique index ingredients_name_key
  on ingredients (restaurant_id, lower(trim(name)));
```

This is the **catalog** — the things a restaurant works with and what they cost. It is not stock on hand; that is `inventory_counts`.

### `menu_item_ingredients`

```sql
create table menu_item_ingredients (
  menu_item_id   uuid not null references menu_items(id) on delete cascade,
  ingredient_id  uuid not null references ingredients(id) on delete cascade,
  quantity       numeric(12,4) not null check (quantity > 0),

  primary key (menu_item_id, ingredient_id)
);

create index mii_ingredient_idx on menu_item_ingredients (ingredient_id);
```

The composite primary key is the whole row, so no surrogate `id` is needed and an ingredient cannot be listed twice on one dish. This table is what makes `operational_fit` meaningful: a proposed Hot Honey Chicken Sandwich needing chicken, bun, honey, pickles, and chili flakes against a restaurant stocking the first four scores 80, and the recommendation can name chili flakes as the one thing to order.

### `inventory_counts`

```sql
create table inventory_counts (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references restaurants(id) on delete cascade,
  ingredient_id     uuid not null references ingredients(id) on delete cascade,

  quantity_on_hand  numeric(12,4) not null check (quantity_on_hand >= 0),
  unit              text not null,

  counted_at        timestamptz not null default now(),
  upload_id         uuid references uploads(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index inventory_counts_latest_idx
  on inventory_counts (restaurant_id, ingredient_id, counted_at desc);
```

**Append-only by design.** An `inventory.csv` upload is a physical count at a moment in time, never an edit. Each row inserts; nothing is overwritten. Two benefits: there is no update-or-insert logic to get wrong, and you get stock history for free, which later supports depletion rates and reorder alerts without a schema change. Current levels come from the `current_inventory` view in §7.

`unit` is copied onto the count rather than only read from `ingredients` because a count is a historical record — if someone later switches an ingredient from pounds to kilograms, past counts must keep their original unit or the history becomes nonsense.

> **Ordering note:** `inventory_counts.upload_id` references `uploads`, so create `uploads` first within `0003_restaurant_state.sql`.

### `sales`

```sql
create table sales (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  menu_item_id   uuid references menu_items(id) on delete set null,

  sold_at        timestamptz not null,
  quantity       integer not null check (quantity > 0),
  revenue        numeric(10,2) not null check (revenue >= 0),
  channel        sales_channel not null default 'other',

  upload_id      uuid references uploads(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index sales_restaurant_time_idx on sales (restaurant_id, sold_at desc);
create index sales_item_time_idx       on sales (menu_item_id, sold_at desc);
create index sales_upload_idx          on sales (upload_id);
```

`menu_item_id` is **nullable with `on delete set null`**, and both halves matter. Nullable lets a sales import whose item name did not match still land, keeping revenue totals correct while recording the unmatched name as a row error on the upload. `set null` means deleting a discontinued menu item does not erase last quarter's revenue — the sale happened regardless.

The two composite indexes serve the two real query shapes: "this restaurant's recent sales" for dashboards, and "this item's history" for baselines. Both need `sold_at desc` because every question is about recent windows.

### `uploads`

```sql
create table uploads (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id) on delete cascade,

  kind            upload_kind not null,
  storage_path    text not null,
  status          upload_status not null default 'pending',

  row_count       integer,
  inserted_count  integer,
  error_count     integer,
  errors          jsonb not null default '[]',

  uploaded_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index uploads_restaurant_idx on uploads (restaurant_id, created_at desc);
```

Not in the original spec, and the highest-value addition in this schema for a hackathon. A CSV import that half-succeeds is the most likely thing to break during a demo, and without this table it breaks invisibly. With it, `status = 'partial'` plus a structured `errors` array tells you exactly which rows failed:

```json
[
  { "row": 14, "code": "unknown_menu_item", "message": "No menu item named 'Wingz'", "value": "Wingz" },
  { "row": 22, "code": "bad_timestamp", "message": "Could not parse '09/01/26 12:15'", "value": "09/01/26 12:15" }
]
```

Because `sales.upload_id` and `inventory_counts.upload_id` point back here, a bad import is also fully reversible: delete rows by `upload_id` and try again.

## 4. Layer 3 — External world

Global tables. No `restaurant_id` anywhere — a trend belongs to the market, not to a tenant.

### `ingest_runs`

```sql
create table ingest_runs (
  id             uuid primary key default gen_random_uuid(),
  source         signal_source not null,

  status         run_status not null default 'running',
  fetched_count  integer not null default 0,
  new_count      integer not null default 0,
  error          text,

  started_at     timestamptz not null default now(),
  finished_at    timestamptz
);

create index ingest_runs_source_idx on ingest_runs (source, started_at desc);
```

`fetched_count` versus `new_count` is the health signal for an adapter. Fetching 200 Reddit posts and finding 0 new ones means dedup is working; fetching 200 and finding 200 new on every run means `source_id` is being generated unstably and the trend scores are inflating on every run.

### `raw_signals`

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

create index raw_signals_source_time_idx on raw_signals (source, fetched_at desc);
create index raw_signals_unprocessed_idx on raw_signals (fetched_at) where processed_at is null;
```

This landing table is the most important structural addition to the original design, which jumped straight from providers to normalized signals.

**`unique (source, source_id)`** makes ingestion idempotent. `source_id` is the provider's own identifier — a Reddit post ID, a Google Trends query-plus-week key, an events API event ID. Adapters insert with `on conflict (source, source_id) do nothing`, so re-running a scrape after a crash is free and cannot double-count evidence.

**`payload`** keeps the provider response untouched. When someone asks why Hot Honey scored 87, you can show them the actual Reddit threads. This is also what makes normalization re-runnable: improve your extraction logic and reprocess history without re-scraping.

**The partial index** on `processed_at is null` is small no matter how large the table grows, since it only holds the backlog. It is what makes "find work to do" a fast query in perpetuity.

### `trends`

```sql
create table trends (
  id                 uuid primary key default gen_random_uuid(),

  name               text not null,
  slug               text not null,
  description        text,
  category           trend_category not null default 'food',
  keywords           text[] not null default '{}',

  trend_score        numeric(5,2) not null default 0 check (trend_score >= 0 and trend_score <= 100),
  trend_velocity     numeric(6,4) not null default 0,

  region             text,
  status             trend_status not null default 'active',

  first_detected_at  timestamptz not null default now(),
  last_updated_at    timestamptz not null default now()
);

create unique index trends_slug_region_key
  on trends (slug, coalesce(region, '*'));

create index trends_ranked_idx
  on trends (status, trend_score desc);

create index trends_keywords_idx
  on trends using gin (keywords);
```

`slug` is the canonical identity (`hot-honey`), so signals about "hot honey," "hot-honey," and "spicy honey" converge on one row instead of fragmenting into three weak trends. Normalization resolves to `slug`, never to `name`.

The unique index scopes a trend to a region, with `coalesce(region, '*')` handling national trends — necessary because Postgres treats NULLs as distinct, which would otherwise let unlimited duplicate national rows accumulate.

`trend_score` and `trend_velocity` are **derived** — recomputed from `trend_signals`, never set by hand or by an LLM. `keywords` with a GIN index is the join key that stage ③ matches against `menu_items.tags`.

### `trend_signals`

```sql
create table trend_signals (
  id             uuid primary key default gen_random_uuid(),
  trend_id       uuid not null references trends(id) on delete cascade,
  raw_signal_id  uuid references raw_signals(id) on delete set null,

  source         signal_source not null,
  signal_value   numeric(5,2) not null check (signal_value >= 0 and signal_value <= 100),
  growth_rate    numeric(6,4),

  observed_at    timestamptz not null,
  metadata       jsonb not null default '{}',
  created_at     timestamptz not null default now()
);

create index trend_signals_trend_time_idx on trend_signals (trend_id, observed_at desc);
create index trend_signals_source_idx     on trend_signals (trend_id, source);
```

One trend, many signals from many sources. `signal_value` is normalized 0–100 so Google Trends' 0–100 index and a Reddit mention count become comparable; `growth_rate` is a decimal fraction, so `0.43` means +43%.

The `(trend_id, source)` index supports the `local_relevance` component, which needs the share of a trend's signals that came from local sources.

## 5. Layer 4 — Decision

### `opportunities`

```sql
create table opportunities (
  id                             uuid primary key default gen_random_uuid(),
  restaurant_id                  uuid not null references restaurants(id) on delete cascade,
  trend_id                       uuid not null references trends(id) on delete cascade,
  menu_item_id                   uuid references menu_items(id) on delete set null,

  -- component scores, 0-100, snapshotted at scoring time
  trend_score                    numeric(5,2) not null check (trend_score >= 0 and trend_score <= 100),
  local_relevance_score          numeric(5,2) not null check (local_relevance_score >= 0 and local_relevance_score <= 100),
  menu_fit_score                 numeric(5,2) not null check (menu_fit_score >= 0 and menu_fit_score <= 100),
  operational_fit_score          numeric(5,2) not null check (operational_fit_score >= 0 and operational_fit_score <= 100),
  profitability_score            numeric(5,2) not null check (profitability_score >= 0 and profitability_score <= 100),
  overall_score                  numeric(5,2) not null check (overall_score >= 0 and overall_score <= 100),

  scoring_version                text not null default 'v1',

  -- economics, snapshotted; null when sales history is insufficient
  suggested_name                 text,
  suggested_price                numeric(10,2) check (suggested_price >= 0),
  estimated_cost                 numeric(10,2) check (estimated_cost >= 0),
  estimated_incremental_revenue  numeric(12,2),
  estimated_incremental_profit   numeric(12,2),

  recommendation                 text,
  missing_ingredients            text[] not null default '{}',

  status                         opportunity_status not null default 'new',
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);

create unique index opportunities_unique_pairing
  on opportunities (restaurant_id, trend_id, menu_item_id, scoring_version)
  nulls not distinct;

create index opportunities_ranked_idx
  on opportunities (restaurant_id, status, overall_score desc);

create trigger opportunities_touch
  before update on opportunities
  for each row execute function public.touch_updated_at();
```

The central table. Four things about it:

**The score columns are intentional denormalized snapshots.** `trend_score` duplicates `trends.trend_score`, and `estimated_cost` duplicates a value derived from `menu_items`. This is not a normalization mistake to be refactored into a join. A recommendation shown in September must still explain itself in October, after the trend has faded and the menu price has changed. The scores are a record of what we believed when we made the claim.

**`scoring_version`** lets you re-score without destroying history. Change the weights, write `v2` rows alongside `v1`, and compare. It is in the unique index for exactly that reason — the same pairing can exist once per version.

**`nulls not distinct`** on that index (Postgres 15+) is required because `menu_item_id` is nullable for trends with no matching item. Under default NULL handling, "Matcha, no matching item" could be inserted unboundedly many times.

**`missing_ingredients`** turns a score into an action. `operational_fit = 80` is a number; "you already stock everything except chili flakes" is something a chef can do this afternoon.

`opportunities_ranked_idx` matches the primary product query — a restaurant's new opportunities, best first.

### `opportunity_evidence`

```sql
create table opportunity_evidence (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities(id) on delete cascade,

  evidence_type   evidence_type not null,
  source          text not null,
  value           numeric(12,4),
  display_value   text,
  description     text not null,

  created_at      timestamptz not null default now()
);

create index opportunity_evidence_idx on opportunity_evidence (opportunity_id, evidence_type);
```

One row per input that moved the score. `value` is the machine-readable number, `display_value` is the pre-formatted string (`"+43%"`, `"$1.37/order"`, `"4 of 5"`) so the frontend never has to guess whether a raw number is a percentage, a ratio, or dollars.

This table is the product's credibility. It converts `AI says: 92/100` into:

```text
trend_growth       Google Trends         0.43   "+43%"        "Search interest up 43% in Houston over 30 days"
menu_similarity    Keyword Match         0.94   "0.94"        "Strong match with your Crispy Chicken Sandwich"
ingredient_overlap Restaurant Inventory  0.80   "4 of 5"      "You already stock chicken, bun, honey, and pickles"
margin_impact      Economics Engine      1.37   "+$1.37"      "Higher contribution per order than the current version"
sales_baseline     Sales History         42.0   "42/week"     "You sell about 42 of these per week"
```

## 6. Layer 5 — Activation

### `campaigns`

```sql
create table campaigns (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  opportunity_id  uuid references opportunities(id) on delete set null,

  name            text not null,
  offer           text,

  start_date      timestamptz,
  end_date        timestamptz,
  status          campaign_status not null default 'draft',

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint campaigns_date_order check (
    start_date is null or end_date is null or end_date > start_date
  )
);

create index campaigns_restaurant_idx on campaigns (restaurant_id, status, created_at desc);

create trigger campaigns_touch
  before update on campaigns
  for each row execute function public.touch_updated_at();
```

`channel` and `content` have moved out to `campaign_assets`. The original single-`content`-field design forces one blob of copy per campaign, which breaks the moment a campaign runs on both Instagram and SMS — those need different copy and different lengths.

### `campaign_assets`

```sql
create table campaign_assets (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references campaigns(id) on delete cascade,

  channel         campaign_channel not null,
  variant_label   text not null default 'a',

  headline        text,
  body            text,
  call_to_action  text,
  image_path      text,

  generated_by    text,                    -- 'llm:gpt-4o-mini', 'human'
  prompt_used     text,

  created_at      timestamptz not null default now(),

  constraint campaign_assets_variant_key unique (campaign_id, channel, variant_label)
);

create index campaign_assets_campaign_idx on campaign_assets (campaign_id, channel);
```

This is the "ads that can be created" half of the product, and it needs to be a table rather than a column. `variant_label` supports generating two or three options per channel and letting the operator pick — which is how people actually use generated copy. `generated_by` and `prompt_used` mean a good result is reproducible and a bad one is diagnosable; without them you cannot tell whether weak copy came from a weak prompt or a weak model.

### `experiments`

```sql
create table experiments (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references campaigns(id) on delete cascade,
  restaurant_id     uuid not null references restaurants(id) on delete cascade,

  baseline_start    timestamptz not null,
  baseline_end      timestamptz not null,
  experiment_start  timestamptz not null,
  experiment_end    timestamptz not null,

  target_metric     target_metric not null default 'revenue',
  status            experiment_status not null default 'planned',

  created_at        timestamptz not null default now(),

  constraint experiments_baseline_order   check (baseline_end   > baseline_start),
  constraint experiments_window_order     check (experiment_end > experiment_start),
  constraint experiments_no_overlap       check (experiment_start >= baseline_end)
);

create index experiments_restaurant_idx on experiments (restaurant_id, status);
create index experiments_campaign_idx   on experiments (campaign_id);
```

Separating the experiment from the campaign separates "we launched something" from "we are measuring whether it worked," and lets you re-measure the same campaign over a different window without touching the campaign.

The three check constraints are cheap insurance against the one bug that invalidates every result: `experiments_no_overlap` guarantees the baseline period ends before the measurement period begins. Overlapping windows means the campaign's own lift contaminates the baseline it is compared against, and the resulting ROI is silently meaningless.

### `experiment_results`

```sql
create table experiment_results (
  id                             uuid primary key default gen_random_uuid(),
  experiment_id                  uuid not null references experiments(id) on delete cascade,

  baseline_value                 numeric(12,2) not null,
  actual_value                   numeric(12,2) not null,

  estimated_incremental_revenue  numeric(12,2),
  estimated_incremental_cost     numeric(12,2),
  estimated_incremental_profit   numeric(12,2),

  roi                            numeric(8,4),
  confidence_score               numeric(5,2) check (confidence_score >= 0 and confidence_score <= 100),

  recommendation                 text,
  computed_at                    timestamptz not null default now()
);

create index experiment_results_idx on experiment_results (experiment_id, computed_at desc);
```

Append-only, so re-measuring adds a row rather than overwriting one and you keep the full measurement history. `roi` is a decimal fraction per the rate convention — `9.74` is 974%, and the frontend does the ×100.

## 7. Views

Read helpers so this arithmetic is written once in SQL instead of repeatedly in TypeScript.

### `current_inventory`

```sql
create view current_inventory as
select distinct on (ic.restaurant_id, ic.ingredient_id)
  ic.restaurant_id,
  ic.ingredient_id,
  i.name  as ingredient_name,
  ic.quantity_on_hand,
  ic.unit,
  i.unit_cost,
  ic.quantity_on_hand * i.unit_cost as value_on_hand,
  ic.counted_at
from inventory_counts ic
join ingredients i on i.id = ic.ingredient_id
order by ic.restaurant_id, ic.ingredient_id, ic.counted_at desc;
```

Collapses append-only counts into "what is on the shelf right now." `distinct on` is the Postgres-native way to take the latest row per group and is faster than a window-function subquery here.

### `menu_item_daily_sales`

```sql
create view menu_item_daily_sales as
select
  s.restaurant_id,
  s.menu_item_id,
  (s.sold_at at time zone r.timezone)::date as local_date,
  extract(isodow from (s.sold_at at time zone r.timezone)) as day_of_week,
  sum(s.quantity)                                  as units,
  sum(s.revenue)                                   as revenue,
  sum(s.quantity * mi.estimated_cost)              as food_cost,
  sum(s.revenue - s.quantity * mi.estimated_cost)  as contribution
from sales s
join restaurants r  on r.id = s.restaurant_id
join menu_items  mi on mi.id = s.menu_item_id
group by s.restaurant_id, s.menu_item_id, local_date, day_of_week;
```

The foundation of every baseline. Note `at time zone r.timezone` — bucketing by UTC date would misattribute a Friday 11pm Houston sale to Saturday, which is precisely the error that makes weekend-versus-weekday baselines wrong.

`day_of_week` is projected because the real baseline question is day-specific: comparing a Friday promotion against an all-days average understates the baseline and overstates your lift.

### `menu_item_baselines`

```sql
create view menu_item_baselines as
select
  restaurant_id,
  menu_item_id,
  day_of_week,
  avg(units)        as avg_units,
  avg(revenue)      as avg_revenue,
  avg(contribution) as avg_contribution,
  count(*)          as observed_days
from menu_item_daily_sales
where local_date >= (current_date - interval '28 days')
group by restaurant_id, menu_item_id, day_of_week;
```

A 28-day trailing window over four observations per weekday: recent enough to reflect current demand, long enough to be more than noise. `observed_days` is the honesty column — with fewer than 3 observations, the economics stage should return nulls rather than a confident-looking projection built on one data point.

## 8. Row Level Security

Enable RLS on **every** table. A table with RLS off is readable by anyone holding the anon key.

```sql
alter table restaurants           enable row level security;
alter table menu_items            enable row level security;
alter table ingredients           enable row level security;
alter table menu_item_ingredients enable row level security;
alter table inventory_counts      enable row level security;
alter table sales                 enable row level security;
alter table uploads               enable row level security;
alter table ingest_runs           enable row level security;
alter table raw_signals           enable row level security;
alter table trends                enable row level security;
alter table trend_signals         enable row level security;
alter table opportunities         enable row level security;
alter table opportunity_evidence  enable row level security;
alter table campaigns             enable row level security;
alter table campaign_assets       enable row level security;
alter table experiments           enable row level security;
alter table experiment_results    enable row level security;
```

### Ownership helper

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

`security invoker` is correct here, not `definer`. The inner query is itself subject to the `restaurants` policy, which is exactly the predicate we want, and there is no recursion because the `restaurants` policies do not call this function. Using `definer` would work but would needlessly widen the trust boundary.

`stable` lets Postgres call it once per query rather than once per row.

### Class 1 — Tenant-scoped tables

Root table:

```sql
create policy restaurants_owner_all on restaurants
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
```

Direct children, each identical apart from the table name:

```sql
create policy menu_items_tenant on menu_items
  for all to authenticated
  using (public.owns_restaurant(restaurant_id))
  with check (public.owns_restaurant(restaurant_id));

-- repeat verbatim for: ingredients, inventory_counts, sales, uploads,
-- opportunities, campaigns, experiments
```

Both clauses are required. `using` filters what you can read, update, and delete; `with check` validates what you insert or update into. A policy with only `using` lets a user insert rows assigned to someone else's restaurant.

Grandchildren have no `restaurant_id`, so they reach ownership through their parent:

```sql
create policy mii_tenant on menu_item_ingredients
  for all to authenticated
  using (exists (
    select 1 from menu_items mi
    where mi.id = menu_item_id and public.owns_restaurant(mi.restaurant_id)
  ))
  with check (exists (
    select 1 from menu_items mi
    where mi.id = menu_item_id and public.owns_restaurant(mi.restaurant_id)
  ));

create policy opportunity_evidence_tenant on opportunity_evidence
  for all to authenticated
  using (exists (
    select 1 from opportunities o
    where o.id = opportunity_id and public.owns_restaurant(o.restaurant_id)
  ))
  with check (exists (
    select 1 from opportunities o
    where o.id = opportunity_id and public.owns_restaurant(o.restaurant_id)
  ));

create policy campaign_assets_tenant on campaign_assets
  for all to authenticated
  using (exists (
    select 1 from campaigns c
    where c.id = campaign_id and public.owns_restaurant(c.restaurant_id)
  ))
  with check (exists (
    select 1 from campaigns c
    where c.id = campaign_id and public.owns_restaurant(c.restaurant_id)
  ));

create policy experiment_results_tenant on experiment_results
  for all to authenticated
  using (exists (
    select 1 from experiments e
    where e.id = experiment_id and public.owns_restaurant(e.restaurant_id)
  ))
  with check (exists (
    select 1 from experiments e
    where e.id = experiment_id and public.owns_restaurant(e.restaurant_id)
  ));
```

### Class 2 — Shared read-only tables

```sql
create policy trends_read on trends
  for select to authenticated
  using (true);

create policy trend_signals_read on trend_signals
  for select to authenticated
  using (true);
```

Trends are market data, shared by every restaurant on the platform. Note there is **no insert, update, or delete policy** — only the service role writes here, and the absence of a policy is what enforces that. This is the class the original spec's blanket `restaurant.owner_id = auth.uid()` pattern could not express, since these tables have no `restaurant_id` at all.

### Class 3 — Internal tables

```sql
-- raw_signals and ingest_runs: RLS enabled, zero policies.
-- Only the service role can touch them.
```

No policies is not an omission; it is the strictest possible setting. Users have no business reading raw scraped payloads or job telemetry, and the service role bypasses RLS entirely.

### Storage

```sql
create policy uploads_bucket_tenant on storage.objects
  for all to authenticated
  using (
    bucket_id = 'uploads'
    and public.owns_restaurant(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'uploads'
    and public.owns_restaurant(((storage.foldername(name))[1])::uuid)
  );
```

One private bucket named `uploads`, path convention `{restaurant_id}/{kind}/{unix_ms}-{filename}`. The policy reads the first path segment as a restaurant ID and applies the same ownership check as every other table, so file access and row access cannot drift apart.

### The rule that outranks all of the above

**The service role key bypasses RLS completely.** Every policy in this section is void for any code holding it.

- It exists only in Edge Function secrets — never in a client bundle, never committed.
- Only `job-*` functions use it.
- User-facing functions build their Supabase client from the anon key plus the caller's forwarded `Authorization` header, so RLS applies to them exactly as it does to the frontend.

An Edge Function that serves user requests using the service role has silently turned off authorization for that endpoint, and no policy above will save you. This is the single highest-risk line of code in the project.

## 9. Table reference

| Table | Layer | Scope | Rows written by | Notes |
|---|---|---|---|---|
| `restaurants` | 1 | tenant | user | `timezone` drives all day bucketing |
| `menu_items` | 2 | tenant | user, CSV | generated `contribution`; unique on lowered name |
| `ingredients` | 2 | tenant | user, CSV | catalog and cost, not stock |
| `menu_item_ingredients` | 2 | tenant | user | drives `operational_fit` |
| `inventory_counts` | 2 | tenant | CSV | append-only; read via `current_inventory` |
| `sales` | 2 | tenant | CSV | nullable `menu_item_id` by design |
| `uploads` | 2 | tenant | function | makes imports debuggable and reversible |
| `ingest_runs` | 3 | internal | job | adapter health telemetry |
| `raw_signals` | 3 | internal | job | `unique (source, source_id)` = idempotent ingest |
| `trends` | 3 | shared read | job | scores derived, never hand-set |
| `trend_signals` | 3 | shared read | job | one trend, many sources |
| `opportunities` | 4 | tenant | job | the product; scores are snapshots |
| `opportunity_evidence` | 4 | tenant | job | the "why" behind the score |
| `campaigns` | 5 | tenant | user, function | channel-free; assets carry channels |
| `campaign_assets` | 5 | tenant | function, LLM | per-channel ad copy variants |
| `experiments` | 5 | tenant | user, function | check constraints prevent window overlap |
| `experiment_results` | 5 | tenant | function | append-only measurement history |

Seventeen tables, three views. The original spec had twelve tables; the five additions are `uploads`, `ingest_runs`, `raw_signals`, `inventory_counts`, and `campaign_assets`. Each closes a gap between what the product description requires and what the schema could actually store.
