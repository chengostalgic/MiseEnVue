-- 00_schema.test.sql — structural invariants.
--
-- These assert the conventions from architecture.md §5 that are easy to violate
-- silently in a later migration: bare timestamp instead of timestamptz, a float
-- money column, a view that quietly bypasses RLS, a layer-3 table that grows a
-- restaurant_id and destroys the global/tenant split.

begin;
create extension if not exists pgtap;

select plan(23);

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------
select tables_are('public', array[
  'restaurants',
  'menu_items', 'ingredients', 'menu_item_ingredients', 'inventory_counts', 'sales', 'uploads',
  'ingest_runs', 'raw_signals', 'trends', 'trend_signals',
  'opportunities', 'opportunity_evidence',
  'campaigns', 'campaign_assets', 'experiments', 'experiment_results'
], 'the 17 tables from schema.md §9 exist, and nothing else');

select views_are('public', array[
  'current_inventory', 'menu_item_daily_sales', 'menu_item_baselines'
], 'the 3 read-helper views exist');

-- ---------------------------------------------------------------------------
-- Conventions that must hold across every table
-- ---------------------------------------------------------------------------
select is_empty($$
  select c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
$$, 'RLS is enabled on every table in public -- a table with it off is readable by anyone holding the anon key');

select is_empty($$
  select table_name || '.' || column_name
  from information_schema.columns
  where table_schema = 'public' and data_type = 'timestamp without time zone'
$$, 'no bare timestamp columns: every point in time is timestamptz');

select is_empty($$
  select table_name || '.' || column_name
  from information_schema.columns
  where table_schema = 'public' and data_type in ('real', 'double precision')
$$, 'no floating point columns: money and scores are numeric');

-- A view runs with its owner's privileges unless told otherwise, and these views
-- are owned by postgres. Without security_invoker every one of them reads past
-- the RLS policies in 0008 and hands one restaurant's numbers to another.
select is_empty($$
  select c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and not coalesce((
      select option_value::boolean
      from pg_options_to_table(c.reloptions)
      where option_name = 'security_invoker'
    ), false)
$$, 'every view is security_invoker, so RLS still applies when read through a view');

-- ---------------------------------------------------------------------------
-- The layer boundary: layer 3 is global, everything tenant-owned is not
-- ---------------------------------------------------------------------------
select is_empty($$
  select table_name
  from information_schema.columns
  where table_schema = 'public'
    and column_name = 'restaurant_id'
    and table_name in ('trends', 'trend_signals', 'raw_signals', 'ingest_runs')
$$, 'no layer-3 table has a restaurant_id: a trend belongs to the market, not a tenant');

select is_empty($$
  select t.name
  from (values
    ('menu_items'), ('ingredients'), ('inventory_counts'), ('sales'), ('uploads'),
    ('opportunities'), ('campaigns'), ('experiments')
  ) as t(name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = t.name
      and c.column_name = 'restaurant_id'
  )
$$, 'every directly tenant-owned table carries restaurant_id');

-- ---------------------------------------------------------------------------
-- Types and enums
-- ---------------------------------------------------------------------------
select col_type_is('public', 'menu_items',    'price',         'numeric(10,2)', 'money is numeric(10,2)');
select col_type_is('public', 'ingredients',   'unit_cost',     'numeric(10,4)', 'unit cost gets the extra digits');
select col_type_is('public', 'opportunities', 'overall_score', 'numeric(5,2)',  'scores are numeric(5,2)');
select col_type_is('public', 'sales',         'sold_at',       'timestamp with time zone', 'sold_at is timestamptz');

select enum_has_labels('public', 'sales_channel',
  array['in_store', 'online', 'doordash', 'ubereats', 'other']);
select enum_has_labels('public', 'opportunity_status',
  array['new', 'viewed', 'accepted', 'rejected', 'testing', 'completed']);
-- No 'multiple' value: a campaign spanning two channels is two campaign_assets.
select enum_has_labels('public', 'campaign_channel',
  array['instagram', 'tiktok', 'sms', 'email', 'in_store']);

-- ---------------------------------------------------------------------------
-- Indexes that specific product behaviour depends on
-- ---------------------------------------------------------------------------
select has_index('public', 'opportunities', 'opportunities_ranked_idx',
  'the opportunity feed query is indexed');
select has_index('public', 'sales', 'sales_restaurant_time_idx',
  'recent sales for a restaurant is indexed');
select has_index('public', 'raw_signals', 'raw_signals_unprocessed_idx',
  'the ingestion backlog has its partial index -- this is the queue');
select has_index('public', 'menu_items', 'menu_items_name_key',
  'the lowered-name unique index that makes menu CSV upserts safe exists');

select is(
  (select indnullsnotdistinct from pg_index where indexrelid = 'opportunities_unique_pairing'::regclass),
  true,
  'opportunities_unique_pairing is nulls not distinct, so a trend with no matching item cannot be inserted repeatedly'
);

select has_trigger('public', 'menu_items', 'menu_items_touch',
  'menu_items maintains updated_at by trigger');

select has_function('public', 'owns_restaurant', array['uuid'],
  'the single ownership predicate every tenant policy calls exists');

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from storage.buckets where id = 'uploads' and public = false),
  1,
  'the uploads bucket exists and is private'
);

select * from finish();
rollback;
