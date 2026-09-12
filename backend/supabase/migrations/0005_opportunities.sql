-- 0005_opportunities.sql
-- schema.md §5 — Layer 4, the decision. This is the product.

-- ---------------------------------------------------------------------------
-- opportunities
-- ---------------------------------------------------------------------------
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

-- nulls not distinct (Postgres 15+) is required because menu_item_id is nullable
-- for trends with no matching item. Under default NULL handling, "Matcha, no
-- matching item" could be inserted unboundedly many times.
create unique index opportunities_unique_pairing
  on opportunities (restaurant_id, trend_id, menu_item_id, scoring_version)
  nulls not distinct;

create index opportunities_ranked_idx
  on opportunities (restaurant_id, status, overall_score desc);

create trigger opportunities_touch
  before update on opportunities
  for each row execute function public.touch_updated_at();

comment on table opportunities is
  'Score columns and estimated_cost are deliberate denormalized snapshots. Do not refactor them into a live join: a recommendation shown in September must still explain itself in October after the trend faded and the price changed.';
comment on column opportunities.scoring_version is
  'Lets you re-score without destroying history. Part of the unique index so v1 and v2 rows coexist for the same pairing.';
comment on column opportunities.missing_ingredients is
  'Turns a score into an action: operational_fit = 80 is a number, "you stock everything except chili flakes" is something a chef can do this afternoon.';

-- ---------------------------------------------------------------------------
-- opportunity_evidence
-- ---------------------------------------------------------------------------
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

comment on table opportunity_evidence is
  'One row per input that moved the score. This table is the product''s credibility: it converts "AI says 92/100" into a list of reasons.';
comment on column opportunity_evidence.display_value is
  'Pre-formatted string ("+43%", "$1.37/order", "4 of 5") so the frontend never has to guess whether a raw number is a percentage, a ratio, or dollars.';
