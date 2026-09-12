-- 0006_activation.sql
-- schema.md §6 — Layer 5, what happened when they did it.

-- ---------------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------------
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

comment on table campaigns is
  'Channel-free by design: channel and content live on campaign_assets, because a campaign on Instagram and SMS needs different copy and different lengths.';

-- ---------------------------------------------------------------------------
-- campaign_assets
-- ---------------------------------------------------------------------------
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

comment on column campaign_assets.variant_label is
  'Supports generating two or three options per channel and letting the operator pick, which is how people actually use generated copy.';
comment on column campaign_assets.prompt_used is
  'With generated_by, makes a good result reproducible and a bad one diagnosable: otherwise you cannot tell weak prompt from weak model.';

-- ---------------------------------------------------------------------------
-- experiments
-- ---------------------------------------------------------------------------
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

comment on constraint experiments_no_overlap on experiments is
  'Cheap insurance against the one bug that invalidates every result: an overlapping baseline is contaminated by the campaign''s own lift, and the resulting ROI is silently meaningless.';

-- ---------------------------------------------------------------------------
-- experiment_results
-- ---------------------------------------------------------------------------
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

comment on table experiment_results is
  'Append-only: re-measuring adds a row rather than overwriting one, so the full measurement history survives.';
comment on column experiment_results.roi is
  'Decimal fraction per the rate convention: 9.74 is 974%, and the frontend does the x100.';
