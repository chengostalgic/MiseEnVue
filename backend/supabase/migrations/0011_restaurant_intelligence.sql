-- restaurant_intelligence_pipeline.md §§4–13, 18, 25.
-- Goal, format, and experiment budget are scoring inputs. analysis jsonb
-- holds the extras the five score columns cannot: recommendation type,
-- confidence, existing/new ingredients, experiment, risks.

alter table restaurants
  add column if not exists restaurant_type text
    check (restaurant_type is null or restaurant_type in (
      'fast_food', 'fast_casual', 'casual_dining', 'fine_dining',
      'cafe', 'bakery', 'food_truck', 'bar', 'dessert_shop', 'other'
    )),
  add column if not exists primary_goal text
    check (primary_goal is null or primary_goal in (
      'increase_revenue', 'increase_margin', 'increase_average_order_value',
      'attract_new_customers', 'increase_repeat_customers',
      'increase_slow_period_traffic', 'launch_new_menu_item',
      'reduce_food_waste', 'generate_social_buzz', 'increase_delivery_sales'
    )),
  add column if not exists experiment_budget numeric(10,2)
    check (experiment_budget is null or experiment_budget >= 0),
  add column if not exists max_new_ingredients integer
    check (max_new_ingredients is null or max_new_ingredients >= 0);

comment on column restaurants.restaurant_type is
  'Operational format. A food truck and a tasting room should not share a shortlist.';
comment on column restaurants.primary_goal is
  'What this kitchen is trying to do this month. Materially changes ranking.';
comment on column restaurants.experiment_budget is
  'Hard ceiling for a trial. Launch cost above this is a large penalty, not a soft hint.';
comment on column restaurants.max_new_ingredients is
  'How many new SKUs the kitchen will tolerate. Null means no hard cap.';

alter table opportunities
  add column if not exists analysis jsonb not null default '{}';

comment on column opportunities.analysis is
  'Snapshot of restaurant-fit extras: type, confidence, ingredients, experiment, risks. Not a live join.';
