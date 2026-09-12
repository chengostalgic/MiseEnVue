-- 04_scoring.test.sql — the numbers hold together.
--
-- The scoring weights are the most dangerous constants in the system, because a
-- typo in one produces a score that is wrong but still inside 0-100. Every check
-- constraint passes, the dashboard looks normal, and the product quietly starts
-- recommending the wrong dish. So the relationship is asserted, not trusted.

begin;
create extension if not exists pgtap;

select plan(9);

-- ---------------------------------------------------------------------------
-- The weighted formula from architecture.md §6.4
-- ---------------------------------------------------------------------------
create temp table weights as
select 0.25::numeric as trend,
       0.15::numeric as local,
       0.20::numeric as menu_fit,
       0.15::numeric as operational,
       0.25::numeric as profitability;

select is(
  (select trend + local + menu_fit + operational + profitability from weights),
  1.00::numeric,
  'the scoring weights sum to 1.0 -- a typo here yields a wrong score that still passes every constraint'
);

select is_empty($$
  select o.id
  from opportunities o, weights w
  where round(
          w.trend        * o.trend_score
        + w.local        * o.local_relevance_score
        + w.menu_fit     * o.menu_fit_score
        + w.operational  * o.operational_fit_score
        + w.profitability * o.profitability_score
        , 2) <> o.overall_score
$$, 'overall_score is the weighted sum of the five components on every row');

-- ---------------------------------------------------------------------------
-- Scale conventions (architecture.md §5, rule 2 in backend-prompt.md)
-- ---------------------------------------------------------------------------
-- The formula sums score columns directly, so a 0-1 similarity leaking into one
-- of them produces a wrong answer with no error raised.
select is_empty($$
  select id from opportunities
  where least(trend_score, local_relevance_score, menu_fit_score,
              operational_fit_score, profitability_score, overall_score) < 0
     or greatest(trend_score, local_relevance_score, menu_fit_score,
                 operational_fit_score, profitability_score, overall_score) > 100
$$, 'every component score is on the 0-100 scale');

select is_empty($$
  select id from trend_signals where signal_value < 0 or signal_value > 100
$$, 'trend signals are normalized 0-100 so sources are comparable');

-- ---------------------------------------------------------------------------
-- Honesty about missing data
-- ---------------------------------------------------------------------------
-- No matching menu item means no baseline, and no baseline means nulls rather
-- than an invented projection.
select is(
  (select count(*)::int from opportunities
    where menu_item_id is null
      and (estimated_incremental_revenue is not null or estimated_incremental_profit is not null)),
  0,
  'an opportunity with no matched menu item reports null financials instead of a guess'
);

-- ---------------------------------------------------------------------------
-- Evidence: the difference between a product and a black box
-- ---------------------------------------------------------------------------
select is_empty($$
  select o.id
  from opportunities o
  where o.restaurant_id = 'a0000000-0000-0000-0000-000000000001'
    and not exists (
      select 1 from opportunity_evidence e where e.opportunity_id = o.id
    )
$$, 'every opportunity carries at least one evidence row explaining its score');

select is(
  (select count(*)::int from opportunity_evidence
    where opportunity_id = 'a0000000-0000-0000-0000-000000000401'),
  5,
  'the flagship opportunity has all five evidence types behind its 85.55'
);

-- ---------------------------------------------------------------------------
-- Experiment arithmetic
-- ---------------------------------------------------------------------------
select is(
  (select actual_value - baseline_value from experiment_results
    where experiment_id = 'a0000000-0000-0000-0000-000000000601'),
  (select estimated_incremental_revenue from experiment_results
    where experiment_id = 'a0000000-0000-0000-0000-000000000601'),
  'incremental revenue is actual minus baseline, not a separate estimate'
);

-- roi is a decimal fraction, so 1.6460 is 165% and the frontend does the x100.
select cmp_ok(
  (select abs(roi - (estimated_incremental_profit / greatest(estimated_incremental_cost, 1)))
     from experiment_results
    where experiment_id = 'a0000000-0000-0000-0000-000000000601'),
  '<',
  0.0001::numeric,
  'roi equals incremental profit over incremental cost, as a fraction'
);

select * from finish();
rollback;
