-- 03_rls.test.sql — tenant isolation.
--
-- A tenant isolation failure is not a normal bug. It is the one failure that
-- ends the product, so it gets tested like application code rather than
-- reasoned about.
--
-- Every assertion runs as a real Postgres role with a real JWT claim, not as
-- postgres, because postgres bypasses RLS entirely and would pass everything.

begin;
create extension if not exists pgtap;

select plan(20);

-- Resolve the two owners while still privileged. The ids are looked up rather
-- than hard-coded so this also passes on a hosted project where the demo users
-- were created through the dashboard.
create temp table who as
select
  (select owner_id from restaurants where id = 'a0000000-0000-0000-0000-000000000001') as a,
  (select owner_id from restaurants where id = 'b0000000-0000-0000-0000-000000000001') as b;

-- ===========================================================================
-- Tenant A
-- ===========================================================================
select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select a from who), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select count(*)::int from restaurants),
  1,
  'tenant A sees exactly one restaurant: their own'
);

select is(
  (select id from restaurants),
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'and it is the right one'
);

select is((select count(*)::int from menu_items),   12, 'tenant A sees their 12 menu items and none of B''s');
select is((select count(*)::int from ingredients),  20, 'tenant A sees their 20 ingredients');
select is((select count(*)::int from opportunities), 5, 'tenant A sees their 5 opportunities, not B''s');
select is((select count(*)::int from campaigns),     1, 'tenant A sees their campaign');
select is((select count(*)::int from campaign_assets), 3, 'grandchild rows reach ownership through the parent campaign');
select is((select count(*)::int from experiment_results), 1, 'and through the parent experiment');

select is(
  (select count(*)::int from menu_items where restaurant_id = 'b0000000-0000-0000-0000-000000000001'),
  0,
  'asking directly for tenant B''s rows returns nothing rather than an error -- RLS filters, it does not warn'
);

-- Views must not become a way around the policies.
select is_empty($$
  select restaurant_id from current_inventory
  where restaurant_id <> 'a0000000-0000-0000-0000-000000000001'
$$, 'current_inventory is filtered by RLS through the view');

select is_empty($$
  select restaurant_id from menu_item_daily_sales
  where restaurant_id <> 'a0000000-0000-0000-0000-000000000001'
$$, 'menu_item_daily_sales is filtered by RLS through the view');

-- with check is what stops a user writing rows onto someone else's restaurant.
-- A policy with only `using` would allow this.
select throws_ok($$
  insert into menu_items (restaurant_id, name, price)
  values ('b0000000-0000-0000-0000-000000000001', 'Trojan Taco', 4.00)
$$, '42501', null::text, 'tenant A cannot insert a row onto tenant B''s restaurant');

-- ---------------------------------------------------------------------------
-- Class 2 — shared read-only
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from trends),
  5,
  'trends are market data: every authenticated user reads all of them'
);

-- No insert policy exists on trends. Absence of a policy is the enforcement.
select throws_ok($$
  insert into trends (name, slug) values ('Fake Trend', 'fake-trend')
$$, '42501', null::text, 'an authenticated user cannot write to trends -- only the service role can');

-- ---------------------------------------------------------------------------
-- Class 3 — internal
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from raw_signals) + (select count(*)::int from ingest_runs),
  0,
  'raw_signals and ingest_runs have RLS on and zero policies, so users see nothing at all'
);

-- ---------------------------------------------------------------------------
-- Blind writes across the tenant boundary
-- ---------------------------------------------------------------------------
-- Neither of these raises. `using` filters the rows away, so both silently
-- affect nothing -- which is the behaviour we want, and the reason the check has
-- to be "did B's data change" rather than "did the statement fail."
update menu_items   set price = 999.00 where restaurant_id = 'b0000000-0000-0000-0000-000000000001';
delete from opportunities              where restaurant_id = 'b0000000-0000-0000-0000-000000000001';

reset role;

select is(
  (select count(*)::int from menu_items
    where restaurant_id = 'b0000000-0000-0000-0000-000000000001' and price = 999.00),
  0,
  'tenant A''s blind update changed none of tenant B''s menu items'
);

select is(
  (select count(*)::int from opportunities
    where restaurant_id = 'b0000000-0000-0000-0000-000000000001'),
  1,
  'tenant A''s blind delete removed none of tenant B''s opportunities'
);

-- ===========================================================================
-- Tenant B — the same policies, viewed from the other side
-- ===========================================================================
select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select b from who), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is((select count(*)::int from menu_items), 3, 'tenant B sees only their own 3 menu items');
select is(
  (select count(*)::int from sales where restaurant_id = 'a0000000-0000-0000-0000-000000000001'),
  0,
  'tenant B cannot read tenant A''s sales'
);

-- ===========================================================================
-- Anonymous
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

select is(
  (select count(*)::int from restaurants)
  + (select count(*)::int from menu_items)
  + (select count(*)::int from sales)
  + (select count(*)::int from opportunities)
  + (select count(*)::int from trends),
  0,
  'the anon key alone reads nothing: every policy is scoped to authenticated'
);

reset role;
select * from finish();
rollback;
