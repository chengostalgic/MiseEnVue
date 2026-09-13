# Restaurant Intelligence Pipeline: Required Inputs, Data Model, and Integration

## 1. Purpose

This document defines the restaurant-side information needed for the app's recommendation pipeline and explains how that information integrates with the application's existing functionality.

The app currently:

1. Takes in a small restaurant's financial situation, kitchen, and location.
2. Identifies food and dining trends — nearby, in other US cities, and abroad.
3. Recommends menu items based on those trends and what this kitchen can run.
4. Helps the restaurant evaluate whether those recommendations are financially realistic.
5. Identifies relevant creators who may help market the restaurant or a recommended menu item.

The core product question is:

> **What opportunity could this restaurant realistically execute and profit from — drawing on nearby demand plus takes from other cities and countries?**

The system should therefore combine:

- Restaurant identity
- Existing menu
- Operational capabilities
- Ingredient/inventory information
- Financial constraints
- Business goals
- Nearby, city, US, and worldwide trend signals
- Competitor activity
- Influencer information

The restaurant should only be asked for information that cannot be reliably derived elsewhere.

---

# 2. Core Product Flow

```text
Restaurant Profile
        |
        v
Current Menu + Operations
        |
        v
Financial Constraints
        |
        +-----------------------+
        |                       |
        v                       v
Trend Engine              Competitor Data
        |                       |
        +-----------+-----------+
                    |
                    v
            Opportunity Engine
                    |
        +-----------+-----------+
        |                       |
        v                       v
Menu Recommendation      Marketing Opportunity
        |                       |
        v                       v
Financial Analysis       Influencer Matching
        |
        v
Final Recommendation
```

The final recommendation should not simply answer:

> "What food is trending?"

It should answer:

> "What is trending locally, fits this restaurant, can be made with reasonable operational changes, and has a realistic chance of producing a positive financial return?"

---

# 3. Restaurant-Supplied Information

Restaurant inputs should be divided into:

- **Required onboarding fields**
- **Highly useful fields**
- **Optional advanced fields**
- **Automatically derived/imported fields**

This keeps onboarding lightweight while allowing the recommendation engine to become more sophisticated when richer data is available.

---

# 4. Required Onboarding Fields

These fields should be sufficient to produce a first recommendation.

## 4.1 Restaurant Identity

```text
restaurant_id
restaurant_name
location
cuisine_types[]
restaurant_type
price_level
service_channels[]
```

### Example

```json
{
  "restaurant_name": "Rice Box",
  "location": {
    "address": "Houston, TX",
    "latitude": 29.7604,
    "longitude": -95.3698
  },
  "cuisine_types": [
    "Chinese",
    "Taiwanese"
  ],
  "restaurant_type": "fast_casual",
  "price_level": "$$",
  "service_channels": [
    "dine_in",
    "takeout",
    "delivery"
  ]
}
```

## Why these fields matter

### Location

Location determines:

- Geographic trend relevance
- Nearby competitors
- Local pricing
- Local influencer discovery
- Neighborhood-level consumer behavior

Location should ultimately be stored as latitude and longitude even if the restaurant enters a normal address.

### Cuisine Types

Cuisine acts as an important recommendation filter.

A Vietnamese restaurant and an Italian restaurant may both operate in an area where matcha is trending, but the recommendation engine should score the opportunity differently for each restaurant.

### Restaurant Type

Suggested values:

```text
fast_food
fast_casual
casual_dining
fine_dining
cafe
bakery
food_truck
bar
dessert_shop
other
```

This helps determine whether a proposed item is operationally appropriate.

---

# 5. Business Goal

The restaurant should explicitly tell the system what it is trying to accomplish.

```text
primary_goal
secondary_goals[]
```

Recommended goal values:

```text
increase_revenue
increase_margin
increase_average_order_value
attract_new_customers
increase_repeat_customers
increase_slow_period_traffic
launch_new_menu_item
reduce_food_waste
generate_social_buzz
increase_delivery_sales
```

This field should materially affect recommendation ranking.

For example:

### Goal: Increase Average Order Value

The engine may favor:

- Drinks
- Desserts
- Sides
- Premium add-ons
- Combos

### Goal: Generate Social Buzz

The engine may favor:

- Visually distinctive dishes
- Limited-time offers
- Highly shareable products
- Items connected to rapidly growing social trends

### Goal: Improve Margin

The engine should favor:

- High-margin ingredients
- Existing ingredient overlap
- Low-prep items
- Items requiring little additional equipment

---

# 6. Current Menu

The menu is one of the most important inputs to the system.

It allows the recommendation engine to understand what the restaurant already sells and how far a proposed item would deviate from existing operations.

## 6.1 Menu Item Fields

```text
menu_item_id
restaurant_id
name
description
category
price
estimated_unit_cost
active
ingredients[]
```

### Optional performance fields

```text
units_sold_7d
units_sold_30d
revenue_30d
gross_margin
average_rating
```

### Example

```json
{
  "name": "Spicy Chicken Bao",
  "category": "entree",
  "price": 8.00,
  "estimated_unit_cost": 2.20,
  "units_sold_30d": 420,
  "ingredients": [
    "chicken",
    "bao bun",
    "chili crisp",
    "cucumber"
  ]
}
```

---

# 7. Menu Input UX

Restaurants should not be forced to manually type every menu item.

The application should support multiple ingestion paths.

## MVP

```text
Manual entry
Paste menu text
Upload menu file/image
```

## Future Integrations

```text
POS integration
Online ordering platform
Restaurant website scraping
CSV import
Accounting/POS APIs
```

After import, normalize menu items into the application's internal schema.

---

# 8. Ingredient and Inventory Data

Inventory information improves recommendation quality because the system can identify opportunities that reuse existing ingredients.

Detailed inventory tracking should **not** be required for the MVP.

## 8.1 Basic Ingredient Model

```text
ingredient_id
restaurant_id
name
estimated_unit_cost
unit
currently_used
```

## 8.2 Menu-to-Ingredient Mapping

```text
menu_item_ingredients
- menu_item_id
- ingredient_id
- quantity
- unit
```

This allows the engine to calculate ingredient overlap.

Example:

```text
Recommended Item:
Hot Honey Chicken Bao

Existing ingredients:
✓ Chicken
✓ Bao bun
✓ Cucumber
✓ Chili

New ingredients:
+ Honey
```

This is significantly more actionable than simply saying:

> "Hot honey chicken is trending."

---

# 9. Advanced Inventory Fields

These fields are useful later but should not block MVP onboarding.

```text
quantity_on_hand
supplier
cost_per_unit
reorder_threshold
average_daily_usage
expiration_date
lead_time_days
```

These enable future functionality such as:

- Waste reduction
- Overstock recommendations
- Inventory-aware menu recommendations
- Supplier-cost sensitivity analysis
- Ingredient substitution recommendations

---

# 10. Operational Capabilities

A trend may be popular but impossible for a restaurant to execute.

The system therefore needs basic operational constraints.

```text
equipment[]
dietary_capabilities[]
maximum_prep_time
max_new_ingredients
staff_skill_level
kitchen_capacity
```

## Equipment Examples

```text
fryer
grill
wok
oven
pizza_oven
blender
espresso_machine
soft_serve_machine
smoker
```

## Dietary Capabilities

```text
vegetarian
vegan
halal
kosher
gluten_free
dairy_free
```

---

# 11. Experiment Constraints

These fields are particularly useful for keeping recommendations realistic.

```text
available_experiment_budget
max_new_ingredients
max_equipment_spend
preferred_menu_categories[]
```

### Example

```json
{
  "available_experiment_budget": 1000,
  "max_new_ingredients": 3,
  "max_equipment_spend": 0,
  "preferred_menu_categories": [
    "drink",
    "dessert",
    "limited_time_offer"
  ]
}
```

The engine could then reject recommendations requiring:

- Expensive new equipment
- Too many new ingredients
- Large inventory commitments
- Major workflow changes

---

# 12. Financial Profile

The financial profile should remain intentionally lightweight.

The MVP does not need a complete accounting system.

## Recommended Fields

```text
monthly_revenue
monthly_food_cost
monthly_labor_cost
average_order_value
available_experiment_budget
target_food_cost_pct
target_gross_margin_pct
```

## Optional Fields

```text
monthly_rent
monthly_fixed_costs
cash_available
target_revenue_growth_pct
delivery_revenue_pct
dine_in_revenue_pct
```

---

# 13. Why These Financial Fields Matter

## Average Order Value

Suppose:

```text
Current AOV = $18
```

A proposed:

```text
$28 entree
```

may be difficult to introduce.

A:

```text
$4.50 beverage add-on
```

may have much stronger potential.

---

## Target Food Cost

If the restaurant wants:

```text
food_cost <= 30%
```

then:

```text
estimated_food_cost / proposed_price
```

should be considered during recommendation scoring.

---

## Experiment Budget

A restaurant with:

```text
$300
```

available for experimentation should receive very different recommendations from one with:

```text
$10,000
```

available.

---

# 14. Information the Restaurant Should NOT Need to Enter

The application should derive or retrieve the following wherever possible.

## Local Market Information

```text
nearby_restaurants
nearby_menu_items
nearby_menu_prices
restaurant_density
cuisine_distribution
new_restaurant_openings
ratings
review_velocity
```

## Trend Information

```text
trend_name
trend_category
trend_growth_rate
trend_score
local_relevance_score
social_mentions
search_growth
restaurant_adoption_rate
market_saturation
```

## Influencer Information

```text
creator_name
platform
follower_count
location
engagement_rate
local_audience_percentage
food_content_percentage
cuisine_affinity
estimated_cost
past_restaurant_collaborations
```

These should be part of the external-data pipeline rather than the onboarding flow.

---

# 15. Integration with Existing Trend Functionality

The existing local trend engine should consume:

```text
restaurant.location
restaurant.cuisine_types
restaurant.restaurant_type
restaurant.price_level
```

and produce candidate trends.

Example:

```json
{
  "trend": "hot honey chicken",
  "trend_score": 0.87,
  "local_growth": 0.72,
  "market_saturation": 0.31,
  "distance_relevance": 0.95
}
```

The restaurant data should then determine whether the trend is actually useful.

---

# 16. Trend-to-Restaurant Fit

For each candidate trend, calculate a restaurant-specific fit score.

Example components:

```text
cuisine_fit
ingredient_overlap
equipment_fit
price_fit
financial_fit
goal_fit
local_demand
competition_saturation
```

Possible scoring model:

```text
restaurant_fit =
    cuisine_fit
  + ingredient_overlap
  + equipment_fit
  + price_fit
  + financial_fit
  + goal_fit
```

Then calculate:

```text
opportunity_score =
    trend_strength
  * restaurant_fit
  * local_demand
  * margin_potential
  * (1 - market_saturation)
```

Exact weights can initially be heuristic.

The important design decision is that **trend strength should never be the only ranking factor**.

---

# 17. Example Recommendation

Instead of:

```text
Hot honey chicken is trending in your area.
```

The system should produce:

```text
Recommendation:
Launch a Hot Honey Chicken Bao as a 4-week limited-time offer.

Why it fits:
- Hot honey mentions are growing locally.
- Your restaurant already sells chicken bao.
- 4 of 5 required ingredients are already in your menu.
- Only one new ingredient is required: hot honey.
- Your existing bao sells for $8.
- Similar nearby products sell between $8.50 and $10.
- Estimated food cost remains below your target.
- Estimated launch cost is within your $500 experiment budget.
```

This is the desired level of recommendation specificity.

---

# 18. Recommendation Output Schema

```text
recommendation_id
restaurant_id
trend_id
recommendation_type
name
description

trend_score
restaurant_fit_score
financial_score
operational_score
competition_score
overall_opportunity_score

estimated_price
estimated_unit_cost
estimated_margin
estimated_launch_cost

existing_ingredients[]
new_ingredients[]
required_equipment[]

reasoning_summary
risks[]
suggested_experiment
```

---

# 19. Recommendation Types

The application should support more than entirely new menu items.

Possible values:

```text
new_menu_item
limited_time_offer
menu_variant
bundle
drink
dessert
add_on
promotion
pricing_change
ingredient_reuse_opportunity
```

This improves recommendation quality because sometimes the best response to a trend is not creating a completely new dish.

---

# 20. Influencer Discovery Integration

Influencer matching should occur after or alongside recommendation generation.

The system should use:

```text
restaurant.location
restaurant.cuisine_types
restaurant.target_customer_segments
restaurant.marketing_budget
recommendation.trend
recommendation.menu_category
```

to identify creators.

---

# 21. Restaurant Marketing Profile

Optional onboarding fields:

```text
target_customer_segments[]
preferred_platforms[]
influencer_budget
campaign_goal
preferred_content_types[]
```

### Example

```json
{
  "target_customer_segments": [
    "college_students",
    "young_professionals"
  ],
  "preferred_platforms": [
    "tiktok",
    "instagram"
  ],
  "influencer_budget": 500,
  "campaign_goal": "new_menu_launch"
}
```

---

# 22. Influencer Ranking

Influencers should not be ranked primarily by follower count.

Better components include:

```text
local_audience_fit
engagement_rate
cuisine_affinity
restaurant_audience_fit
content_relevance
estimated_cost
past_restaurant_performance
```

Possible scoring function:

```text
influencer_fit =
    local_audience_fit
  * engagement_quality
  * cuisine_affinity
  * customer_segment_fit
  * budget_fit
```

A creator with 15,000 followers and a highly local food-focused audience may be more valuable than a general lifestyle creator with 500,000 followers.

---

# 23. Integrated Recommendation + Influencer Example

```text
Menu Opportunity:
Hot Honey Chicken Bao

Opportunity Score:
84 / 100

Why:
- Strong local trend growth
- 80% ingredient overlap
- No new equipment
- Fits current pricing
- Low local saturation

Suggested Test:
4-week limited-time launch

Estimated Launch Cost:
$340

Suggested Price:
$9.00

Estimated Food Cost:
$2.55

Potential Influencers:
1. Houston food creator A
2. Houston Asian-food creator B
3. Local university creator C

Recommended Campaign:
Invite 3 micro-influencers during launch week and provide trackable promo codes.
```

---

# 24. Suggested Supabase/PostgreSQL Tables

## restaurants

```text
id uuid PK
name text
address text
latitude numeric
longitude numeric
restaurant_type text
price_level text
primary_goal text
created_at timestamptz
updated_at timestamptz
```

---

## restaurant_cuisines

```text
restaurant_id uuid FK
cuisine text
```

Avoid storing cuisine information as one comma-separated field.

---

## financial_profiles

```text
restaurant_id uuid PK/FK
monthly_revenue numeric
monthly_food_cost numeric
monthly_labor_cost numeric
average_order_value numeric
available_experiment_budget numeric
target_food_cost_pct numeric
target_gross_margin_pct numeric
updated_at timestamptz
```

---

## menu_items

```text
id uuid PK
restaurant_id uuid FK
name text
description text
category text
price numeric
estimated_unit_cost numeric
active boolean
created_at timestamptz
updated_at timestamptz
```

---

## ingredients

```text
id uuid PK
restaurant_id uuid FK
name text
unit text
estimated_unit_cost numeric
```

---

## menu_item_ingredients

```text
menu_item_id uuid FK
ingredient_id uuid FK
quantity numeric
unit text
PRIMARY KEY (menu_item_id, ingredient_id)
```

---

## restaurant_capabilities

```text
restaurant_id uuid PK/FK
maximum_prep_time_minutes integer
max_new_ingredients integer
max_equipment_spend numeric
staff_skill_level text
```

---

## restaurant_equipment

```text
restaurant_id uuid FK
equipment_type text
PRIMARY KEY (restaurant_id, equipment_type)
```

---

## restaurant_service_channels

```text
restaurant_id uuid FK
channel text
PRIMARY KEY (restaurant_id, channel)
```

---

## marketing_profiles

```text
restaurant_id uuid PK/FK
influencer_budget numeric
campaign_goal text
```

---

## marketing_target_segments

```text
restaurant_id uuid FK
segment text
PRIMARY KEY (restaurant_id, segment)
```

---

## trends

```text
id uuid PK
name text
category text
source text
created_at timestamptz
```

---

## local_trends

```text
id uuid PK
trend_id uuid FK
geography_key text
trend_score numeric
growth_rate numeric
local_relevance_score numeric
market_saturation numeric
observed_at timestamptz
```

---

## competitors

```text
id uuid PK
restaurant_id uuid FK
external_place_id text
name text
latitude numeric
longitude numeric
cuisine_types jsonb
price_level text
rating numeric
review_count integer
```

---

## competitor_menu_items

```text
id uuid PK
competitor_id uuid FK
name text
description text
price numeric
category text
observed_at timestamptz
```

---

## influencers

```text
id uuid PK
platform text
external_creator_id text
handle text
display_name text
location_text text
follower_count integer
engagement_rate numeric
local_audience_pct numeric
food_content_pct numeric
estimated_cost numeric
updated_at timestamptz
```

---

## recommendations

```text
id uuid PK
restaurant_id uuid FK
trend_id uuid FK

recommendation_type text
name text
description text

trend_score numeric
restaurant_fit_score numeric
financial_score numeric
operational_score numeric
competition_score numeric
overall_opportunity_score numeric

estimated_price numeric
estimated_unit_cost numeric
estimated_margin numeric
estimated_launch_cost numeric

reasoning_summary text
created_at timestamptz
```

---

## recommendation_ingredients

```text
recommendation_id uuid FK
ingredient_name text
ingredient_status text
```

Suggested `ingredient_status` values:

```text
existing
new
substitute
```

---

## recommendation_influencers

```text
recommendation_id uuid FK
influencer_id uuid FK
fit_score numeric
reasoning_summary text
PRIMARY KEY (recommendation_id, influencer_id)
```

---

# 25. Minimum Viable Onboarding

For the MVP, require only:

```text
Restaurant name
Location
Cuisine
Restaurant type
Price level
Current menu
Primary goal
Experiment budget
```

Highly recommended but optional:

```text
Ingredient information
Average order value
Food cost percentage
Equipment
Maximum number of new ingredients
Target customer
Influencer budget
```

The system should still produce recommendations when optional fields are missing.

Missing fields should reduce confidence rather than prevent recommendations.

Example:

```text
Recommendation confidence: Medium

Missing information:
- Ingredient costs
- Current sales volume
- Equipment list
```

---

# 26. Progressive Data Collection

Do not request every possible field during registration.

## Phase 1: Immediate Recommendation

Collect:

```text
identity
location
cuisine
menu
goal
budget
```

## Phase 2: Improve Recommendations

Prompt for:

```text
ingredients
equipment
average order value
food cost
target customer
```

## Phase 3: Integrations

Connect:

```text
POS
accounting
inventory
delivery platforms
social accounts
```

The product should become smarter as additional data becomes available.

---

# 27. Data Provenance

Every important value should track where it came from.

Suggested metadata:

```text
source_type
source_id
observed_at
confidence
```

Example `source_type` values:

```text
user_entered
menu_upload
pos_import
accounting_import
web_source
trend_provider
social_provider
derived
estimated
```

This matters because a user-entered ingredient cost and an estimated ingredient cost should not be treated as equally reliable.

---

# 28. Recommendation Confidence

Each recommendation should include a confidence score.

Example factors:

```text
menu_data_quality
financial_data_quality
trend_data_quality
inventory_data_quality
competitive_data_quality
```

Possible output:

```text
Opportunity Score: 86 / 100
Confidence: 72 / 100
```

This separates:

> "This appears to be a strong opportunity."

from:

> "We have strong evidence that this is a strong opportunity."

---

# 29. MVP Recommendation Algorithm

A first implementation does not need machine learning.

A weighted scoring model is easier to explain, debug, and demo.

Example:

```text
opportunity_score =

0.20 * local_trend_score
+ 0.15 * trend_growth_score
+ 0.15 * ingredient_overlap_score
+ 0.10 * cuisine_fit_score
+ 0.10 * equipment_fit_score
+ 0.10 * financial_fit_score
+ 0.10 * goal_fit_score
+ 0.05 * price_fit_score
+ 0.05 * low_saturation_score
```

Weights can later be learned from actual outcomes.

---

# 30. Ingredient Overlap Score

Example:

```text
required ingredients = 8
existing ingredients = 6

ingredient_overlap_score =
6 / 8
= 0.75
```

The score may also penalize expensive new ingredients.

Example:

```text
ingredient_score =
ingredient_overlap
- new_ingredient_cost_penalty
```

---

# 31. Financial Fit Score

The financial model should consider:

```text
estimated_launch_cost
available_experiment_budget
estimated_food_cost_pct
target_food_cost_pct
estimated_margin
expected_price
current_average_order_value
```

Example rules:

```text
if launch_cost > experiment_budget:
    large penalty

if food_cost_pct > target_food_cost_pct:
    penalty

if recommended_price >> current_average_order_value:
    penalty
```

---

# 32. Operational Fit Score

Consider:

```text
equipment compatibility
number of new ingredients
prep complexity
staff requirements
service-channel compatibility
```

A highly trending product requiring a new $8,000 machine should score poorly for a small restaurant unless the restaurant explicitly allows that investment.

---

# 33. Existing Functionality Integration Summary

The restaurant profile should act as the central context shared across the application's existing features.

```text
                    RESTAURANT PROFILE
                           |
          +----------------+----------------+
          |                |                |
          v                v                v
     TREND ENGINE     FINANCIAL ENGINE   MENU ENGINE
          |                |                |
          +----------------+----------------+
                           |
                           v
                   OPPORTUNITY ENGINE
                           |
                +----------+----------+
                |                     |
                v                     v
        MENU RECOMMENDATION     INFLUENCER ENGINE
                |                     |
                +----------+----------+
                           |
                           v
                   ACTIONABLE PLAN
```

The recommendation engine should therefore be the orchestration layer connecting all existing functionality.

---

# 34. Product Principle

The application should not behave as:

```text
Trend detected
      ↓
Generate food idea
```

It should behave as:

```text
Trend detected
      ↓
Is it locally relevant?
      ↓
Does it fit this cuisine?
      ↓
Can this kitchen produce it?
      ↓
Can existing ingredients be reused?
      ↓
Does the economics work?
      ↓
Is the market already saturated?
      ↓
Does it help the restaurant's current goal?
      ↓
Recommend experiment
      ↓
Find appropriate local creators
      ↓
Measure outcome
```

That pipeline is the core differentiator.

---

# 35. Future Closed-Loop Functionality

Eventually, recommendations should feed performance data back into the system.

For each launched recommendation, track:

```text
launch_date
end_date
units_sold
revenue_generated
ingredient_cost
marketing_spend
influencer_spend
incremental_revenue
incremental_margin
promo_code_usage
social_engagement
```

This enables:

```text
recommendation
      ↓
experiment
      ↓
measurement
      ↓
learning
      ↓
better recommendation
```

The application can then move beyond:

> "Here is an idea."

toward:

> "Here is an idea, here is why it fits your restaurant, here is how to test it, and here is whether the experiment actually worked."

---

# 36. Concrete MVP Scope

For an initial build or hackathon implementation, prioritize:

## Restaurant Input

- Restaurant identity
- Location
- Cuisine
- Menu items
- Menu prices
- Primary business goal
- Experiment budget
- Optional financial profile
- Optional ingredients

## External Data

- Local food trends
- Nearby restaurants
- Competitor menu examples
- Local influencer profiles

## Core Computation

- Trend score
- Cuisine fit
- Ingredient overlap
- Financial fit
- Local saturation
- Overall opportunity score

## Outputs

Each recommendation should display:

```text
Recommended item
Why it is trending
Why it fits this restaurant
Existing ingredients that can be reused
New ingredients required
Suggested selling price
Estimated cost
Estimated margin
Estimated launch budget
Nearby competing examples
Recommended local influencers
Suggested experiment
Confidence level
```

This provides a clear vertical slice of the entire product without requiring the application to become a full POS, accounting system, inventory manager, and social-media platform on day one.
