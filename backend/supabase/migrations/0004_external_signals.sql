-- 0004_external_signals.sql
-- schema.md §4 — Layer 3, what we know about the market.
--
-- Global tables. No restaurant_id anywhere: a trend belongs to the market, not
-- to a tenant. Layers 2 and 3 never reference each other; they meet in layer 4.

-- ---------------------------------------------------------------------------
-- ingest_runs
-- ---------------------------------------------------------------------------
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

comment on table ingest_runs is
  'Adapter health telemetry. fetched_count vs new_count is the signal: new_count = fetched_count on every run means source_id is unstable and trend scores are inflating.';

-- ---------------------------------------------------------------------------
-- raw_signals
-- ---------------------------------------------------------------------------
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

-- Stays small no matter how large the table grows: it only holds the backlog.
-- This is the queue -- durable, inspectable, and free.
create index raw_signals_unprocessed_idx on raw_signals (fetched_at) where processed_at is null;

comment on constraint raw_signals_source_key on raw_signals is
  'Makes ingestion idempotent. Adapters insert with on conflict do nothing, so re-running a scrape after a crash cannot double-count evidence.';
comment on column raw_signals.payload is
  'Provider response, untouched. This is what lets you show the actual Reddit threads behind a score, and what makes normalization re-runnable without re-scraping.';

-- ---------------------------------------------------------------------------
-- trends
-- ---------------------------------------------------------------------------
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

-- coalesce(region, '*') is required: Postgres treats NULLs as distinct, which
-- would otherwise let unlimited duplicate national rows accumulate.
create unique index trends_slug_region_key
  on trends (slug, coalesce(region, '*'));

create index trends_ranked_idx
  on trends (status, trend_score desc);

create index trends_keywords_idx
  on trends using gin (keywords);

comment on column trends.slug is
  'Canonical identity (hot-honey). Normalization resolves to slug, never to name, so "hot honey" / "hot-honey" / "spicy honey" converge on one row.';
comment on column trends.trend_score is
  'Derived: recomputed from trend_signals. Never set by hand or by an LLM.';

-- ---------------------------------------------------------------------------
-- trend_signals
-- ---------------------------------------------------------------------------
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

comment on column trend_signals.signal_value is
  'Normalized 0-100 so Google Trends'' index and a Reddit mention count are comparable.';
comment on column trend_signals.growth_rate is
  'Decimal fraction: 0.43 means +43%.';
