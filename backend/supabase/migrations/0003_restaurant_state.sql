-- 0003_restaurant_state.sql
-- schema.md §3 — Layer 2, what we know about this business.
--
-- `uploads` is created first: inventory_counts.upload_id and sales.upload_id
-- both reference it (schema.md §3 ordering note).

-- ---------------------------------------------------------------------------
-- uploads
-- ---------------------------------------------------------------------------
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

comment on column uploads.errors is
  'Array of {row, code, message, value}. status = ''partial'' plus this array is what makes a half-imported CSV debuggable instead of silent.';

-- ---------------------------------------------------------------------------
-- menu_items
-- ---------------------------------------------------------------------------
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

-- Unique *index* rather than a table constraint because it wraps the column in
-- functions. This is what makes repeated menu.csv upserts safe: without it,
-- uploading twice creates 'Wings' and 'wings ' as separate items and sales rows
-- then split across both.
create unique index menu_items_name_key
  on menu_items (restaurant_id, lower(trim(name)));

create index menu_items_active_idx
  on menu_items (restaurant_id) where active;

create index menu_items_tags_idx
  on menu_items using gin (tags);

create trigger menu_items_touch
  before update on menu_items
  for each row execute function public.touch_updated_at();

comment on column menu_items.contribution is
  'Generated, so margin can never drift from price and estimated_cost.';
comment on column menu_items.tags is
  'MVP matching substrate. Seeded from menu text; what keyword matching searches before pgvector exists.';

-- ---------------------------------------------------------------------------
-- ingredients
-- ---------------------------------------------------------------------------
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

comment on table ingredients is
  'The catalog: things a restaurant works with and what they cost. Not stock on hand -- that is inventory_counts.';

-- ---------------------------------------------------------------------------
-- menu_item_ingredients
-- ---------------------------------------------------------------------------
create table menu_item_ingredients (
  menu_item_id   uuid not null references menu_items(id) on delete cascade,
  ingredient_id  uuid not null references ingredients(id) on delete cascade,
  quantity       numeric(12,4) not null check (quantity > 0),

  primary key (menu_item_id, ingredient_id)
);

create index mii_ingredient_idx on menu_item_ingredients (ingredient_id);

comment on table menu_item_ingredients is
  'What makes operational_fit meaningful: which of a proposed dish''s ingredients the restaurant already works with.';

-- ---------------------------------------------------------------------------
-- inventory_counts
-- ---------------------------------------------------------------------------
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

comment on table inventory_counts is
  'Append-only. An inventory.csv upload is a physical count at a moment in time, never an edit. Current levels come from the current_inventory view.';
comment on column inventory_counts.unit is
  'Copied onto the count, not only read from ingredients: a count is a historical record and must keep its original unit.';

-- ---------------------------------------------------------------------------
-- sales
-- ---------------------------------------------------------------------------
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

comment on column sales.menu_item_id is
  'Nullable so an unmatched sales-import row still lands and revenue totals stay correct; on delete set null so deleting a menu item does not erase last quarter''s revenue.';
