-- 01_constraints.test.sql — the database rejects impossible states.
--
-- Every assertion here is a bug that would otherwise reach production data:
-- a negative price, a score outside 0-100, a duplicated CSV import, an
-- experiment whose baseline is contaminated by its own campaign.
--
-- Runs as postgres, so RLS is bypassed and only the constraints are under test.

begin;
create extension if not exists pgtap;

select plan(17);

-- ---------------------------------------------------------------------------
-- Value ranges
-- ---------------------------------------------------------------------------
select throws_ok($$
  insert into menu_items (restaurant_id, name, price)
  values ('a0000000-0000-0000-0000-000000000001', 'Negative Item', -1.00)
$$, '23514', null::text, 'a negative price is rejected');

select throws_ok($$
  insert into menu_items (restaurant_id, name, price)
  values ('a0000000-0000-0000-0000-000000000001', '   ', 5.00)
$$, '23514', null::text, 'a blank menu item name is rejected');

select throws_ok($$
  update opportunities set overall_score = 101
  where id = 'a0000000-0000-0000-0000-000000000401'
$$, '23514', null::text, 'a score above 100 is rejected');

select throws_ok($$
  insert into trend_signals (trend_id, source, signal_value, observed_at)
  values ('c0000000-0000-0000-0000-000000000001', 'reddit', 140, now())
$$, '23514', null::text, 'a signal_value above 100 is rejected -- the 0-100 scale is enforced, not assumed');

select throws_ok($$
  insert into sales (restaurant_id, sold_at, quantity, revenue)
  values ('a0000000-0000-0000-0000-000000000001', now(), 0, 10.00)
$$, '23514', null::text, 'a zero-quantity sale is rejected');

-- ---------------------------------------------------------------------------
-- Idempotency and identity
-- ---------------------------------------------------------------------------
-- This is what makes re-running a scrape free. Without it an adapter retry
-- double-counts evidence and inflates every trend score, with no error anywhere.
select throws_ok($$
  insert into raw_signals (source, source_id, payload)
  values ('google_trends', 'seed:gt:hot-honey:2026-W36', '{}')
$$, '23505', null::text, 'raw_signals (source, source_id) is unique, so ingestion is idempotent');

-- Case and whitespace variants must collide, otherwise a second menu.csv upload
-- creates 'Wings' and 'wings ' as separate items and sales split across both.
select throws_ok($$
  insert into menu_items (restaurant_id, name, price)
  values ('a0000000-0000-0000-0000-000000000001', '  crispy CHICKEN sandwich ', 13.50)
$$, '23505', null::text, 'menu item names collide case-insensitively and whitespace-trimmed');

select throws_ok($$
  insert into opportunities (
    restaurant_id, trend_id, menu_item_id,
    trend_score, local_relevance_score, menu_fit_score,
    operational_fit_score, profitability_score, overall_score
  ) values (
    'a0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000005', null,
    71, 100, 32, 60, 55, 61.90
  )
$$, '23505', null::text, 'a second null-menu-item opportunity for the same trend is rejected by nulls not distinct');

-- Same pairing under a new scoring_version is allowed: that is how you re-score
-- without destroying history.
select lives_ok($$
  insert into opportunities (
    restaurant_id, trend_id, menu_item_id, scoring_version,
    trend_score, local_relevance_score, menu_fit_score,
    operational_fit_score, profitability_score, overall_score
  ) values (
    'a0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000201', 'v2',
    87, 100, 94, 80, 72, 85.55
  )
$$, 'the same pairing may be re-scored under a new scoring_version');

select throws_ok($$
  insert into campaign_assets (campaign_id, channel, variant_label, body)
  values ('a0000000-0000-0000-0000-000000000501', 'instagram', 'a', 'duplicate variant')
$$, '23505', null::text, 'one asset per (campaign, channel, variant_label)');

-- ---------------------------------------------------------------------------
-- Experiment windows
-- ---------------------------------------------------------------------------
-- An overlapping baseline is contaminated by the campaign's own lift, and the
-- resulting ROI is silently meaningless. This is the one bug that invalidates
-- every result the product reports.
select throws_ok($$
  insert into experiments (campaign_id, restaurant_id, baseline_start, baseline_end, experiment_start, experiment_end)
  values (
    'a0000000-0000-0000-0000-000000000501',
    'a0000000-0000-0000-0000-000000000001',
    now() - interval '30 days', now() - interval '5 days',
    now() - interval '10 days', now()
  )
$$, '23514', null::text, 'an experiment window overlapping its own baseline is rejected');

select throws_ok($$
  insert into campaigns (restaurant_id, name, start_date, end_date)
  values (
    'a0000000-0000-0000-0000-000000000001', 'Backwards',
    now(), now() - interval '1 day'
  )
$$, '23514', null::text, 'a campaign ending before it starts is rejected');

-- ---------------------------------------------------------------------------
-- Generated columns
-- ---------------------------------------------------------------------------
select is(
  (select contribution from menu_items where id = 'a0000000-0000-0000-0000-000000000201'),
  9.40::numeric(10,2),
  'contribution is generated from price - estimated_cost and cannot drift'
);

-- ---------------------------------------------------------------------------
-- Deletion behaviour: set null for facts, cascade for dependents
-- ---------------------------------------------------------------------------
-- A sale is a historical fact that outlives the menu item. Deleting a
-- discontinued item must not erase last quarter's revenue.
create temp table cookie_sales as
  select count(*) as n
  from sales
  where menu_item_id = 'a0000000-0000-0000-0000-000000000212';

select cmp_ok((select n from cookie_sales), '>', 0::bigint,
  'the fixture item has sales history to preserve');

select lives_ok(
  $$ delete from menu_items where id = 'a0000000-0000-0000-0000-000000000212' $$,
  'a menu item with sales history can be deleted'
);

select is(
  (select count(*) from sales
    where upload_id = 'a0000000-0000-0000-0000-000000000103'
      and menu_item_id is null),
  (select n from cookie_sales),
  'those sales survived with menu_item_id set to null, so revenue totals stay correct'
);

-- The other half: a child meaningless without its parent goes away.
delete from restaurants where id = 'b0000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from menu_items where restaurant_id = 'b0000000-0000-0000-0000-000000000001'),
  0,
  'deleting a restaurant cascades to its menu items'
);

select * from finish();
rollback;
