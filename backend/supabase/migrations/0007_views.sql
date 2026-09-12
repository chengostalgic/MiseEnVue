-- 0007_views.sql
-- schema.md §7 — read helpers, so this arithmetic is written once in SQL
-- instead of repeatedly in TypeScript.
--
-- security_invoker = on is mandatory, not stylistic. A Postgres view runs with
-- its owner's privileges by default, and these views are owned by postgres, so
-- without it every view would read straight past the RLS policies in 0008 and
-- hand one restaurant's numbers to another. It is the only way "RLS on every
-- table" survives contact with a view.

-- ---------------------------------------------------------------------------
-- current_inventory — collapse append-only counts into "what is on the shelf now"
-- ---------------------------------------------------------------------------
create view current_inventory
with (security_invoker = on) as
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

comment on view current_inventory is
  'distinct on is the Postgres-native way to take the latest row per group, and faster than a window-function subquery here.';

-- ---------------------------------------------------------------------------
-- menu_item_daily_sales — the foundation of every baseline
-- ---------------------------------------------------------------------------
create view menu_item_daily_sales
with (security_invoker = on) as
select
  s.restaurant_id,
  s.menu_item_id,
  (s.sold_at at time zone r.timezone)::date            as local_date,
  extract(isodow from (s.sold_at at time zone r.timezone)) as day_of_week,
  sum(s.quantity)                                     as units,
  sum(s.revenue)                                      as revenue,
  sum(s.quantity * mi.estimated_cost)                 as food_cost,
  sum(s.revenue - s.quantity * mi.estimated_cost)     as contribution
from sales s
join restaurants r  on r.id = s.restaurant_id
join menu_items  mi on mi.id = s.menu_item_id
group by s.restaurant_id, s.menu_item_id, local_date, day_of_week;

comment on view menu_item_daily_sales is
  'at time zone r.timezone is load-bearing: bucketing by UTC date misattributes a Friday 11pm Houston sale to Saturday, which is exactly the error that makes weekend-vs-weekday baselines wrong.';

-- ---------------------------------------------------------------------------
-- menu_item_baselines — 28-day trailing, day-of-week specific
-- ---------------------------------------------------------------------------
create view menu_item_baselines
with (security_invoker = on) as
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

comment on column menu_item_baselines.observed_days is
  'The honesty column. Below 3 observations the economics stage should return nulls rather than a confident-looking projection built on one data point.';

grant select on current_inventory, menu_item_daily_sales, menu_item_baselines
  to authenticated, service_role;
