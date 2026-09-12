-- 02_views.test.sql — the read helpers compute what the product claims.
--
-- The headline assertion is the timezone one. Bucketing sales by UTC date
-- misattributes a Friday 11pm Houston sale to Saturday, which understates the
-- Friday baseline and overstates the lift of any Friday promotion. Every
-- economics number downstream inherits that error, and nothing raises.

begin;
create extension if not exists pgtap;

select plan(12);

-- ---------------------------------------------------------------------------
-- current_inventory — latest count wins
-- ---------------------------------------------------------------------------
-- inventory_counts is append-only, so chicken thigh has two counts 14 days
-- apart. Only the newer one is current.
select is(
  (select quantity_on_hand from current_inventory
    where restaurant_id = 'a0000000-0000-0000-0000-000000000001'
      and ingredient_id = 'a0000000-0000-0000-0000-000000000301'),
  48.0000::numeric(12,4),
  'current_inventory returns the most recent count, not the older one'
);

select is(
  (select count(*)::int from inventory_counts
    where restaurant_id = 'a0000000-0000-0000-0000-000000000001'
      and ingredient_id = 'a0000000-0000-0000-0000-000000000301'),
  2,
  'the superseded count is still on disk -- nothing was overwritten'
);

select is(
  (select value_on_hand from current_inventory
    where ingredient_id = 'a0000000-0000-0000-0000-000000000301'),
  156.0000::numeric,
  'value_on_hand is quantity x unit_cost (48 lb x $3.25)'
);

-- ---------------------------------------------------------------------------
-- menu_item_daily_sales — local-day bucketing
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from sales
    where restaurant_id = 'a0000000-0000-0000-0000-000000000001'
      and (sold_at at time zone 'America/Chicago')::time = time '23:40'),
  1,
  'the 23:40-local fixture row exists'
);

-- If these two dates were equal the next assertion would prove nothing.
select isnt(
  (select (sold_at at time zone 'America/Chicago')::date from sales
    where restaurant_id = 'a0000000-0000-0000-0000-000000000001'
      and (sold_at at time zone 'America/Chicago')::time = time '23:40'),
  (select (sold_at at time zone 'UTC')::date from sales
    where restaurant_id = 'a0000000-0000-0000-0000-000000000001'
      and (sold_at at time zone 'America/Chicago')::time = time '23:40'),
  'that row genuinely straddles midnight UTC, so the bucketing test is meaningful'
);

select is(
  (select mds.day_of_week::int
     from menu_item_daily_sales mds
    where mds.restaurant_id = 'a0000000-0000-0000-0000-000000000001'
      and mds.menu_item_id = 'a0000000-0000-0000-0000-000000000201'
      and mds.local_date = (
        select (sold_at at time zone 'America/Chicago')::date from sales
         where restaurant_id = 'a0000000-0000-0000-0000-000000000001'
           and (sold_at at time zone 'America/Chicago')::time = time '23:40'
      )),
  5,
  'the 23:40 sale buckets to the local Friday, not the UTC Saturday'
);

-- Totals must survive the grouping.
select is(
  (select sum(units)::numeric from menu_item_daily_sales
    where restaurant_id = 'a0000000-0000-0000-0000-000000000001'),
  (select sum(quantity)::numeric from sales
    where restaurant_id = 'a0000000-0000-0000-0000-000000000001'
      and menu_item_id is not null),
  'the view accounts for every matched unit sold'
);

-- Unmatched sales are deliberately excluded from the per-item view but must
-- still be present in the table: revenue stays correct even when the link does not.
select is(
  (select count(*)::int from sales
    where restaurant_id = 'a0000000-0000-0000-0000-000000000001'
      and menu_item_id is null),
  2,
  'the two unresolved rows from the partial upload are still in sales'
);

select is_empty($$
  select local_date
  from menu_item_daily_sales
  where restaurant_id = 'a0000000-0000-0000-0000-000000000001'
    and round(contribution, 2) <> round(revenue - food_cost, 2)
$$, 'contribution equals revenue minus food cost on every row');

-- ---------------------------------------------------------------------------
-- menu_item_baselines — day-of-week specific, 28-day trailing
-- ---------------------------------------------------------------------------
select is(
  (select count(distinct day_of_week)::int from menu_item_baselines
    where restaurant_id = 'a0000000-0000-0000-0000-000000000001'
      and menu_item_id = 'a0000000-0000-0000-0000-000000000201'),
  7,
  'the baseline covers all seven weekdays'
);

select cmp_ok(
  (select avg_units from menu_item_baselines
    where menu_item_id = 'a0000000-0000-0000-0000-000000000201' and day_of_week = 6),
  '>',
  (select avg_units from menu_item_baselines
    where menu_item_id = 'a0000000-0000-0000-0000-000000000201' and day_of_week = 1),
  'Saturday outsells Monday -- the weekday variation the baseline exists to capture is real'
);

-- Below 3 observations the economics stage must return nulls rather than a
-- confident-looking projection built on one data point.
select is_empty($$
  select menu_item_id
  from menu_item_baselines
  where restaurant_id = 'a0000000-0000-0000-0000-000000000001'
    and observed_days < 3
$$, 'every baseline in the demo has at least 3 observations, so the economics stage has something honest to work with');

select * from finish();
rollback;
