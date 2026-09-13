-- seed.sql — the demo dataset.
--
-- Per architecture.md §10 this must exercise the whole pipeline end to end:
-- one restaurant, ~12 priced menu items, ingredients wired to those items, an
-- inventory count, ~90 days of sales with believable weekday/weekend variation,
-- and five trends with signals from at least two sources.
--
-- Two things here go slightly beyond that list, both on purpose:
--
--   * A second restaurant owned by a second user. Tenant isolation is the one
--     bug class that matters more than any other, and it cannot be tested with
--     one tenant. supabase/tests/03_rls.test.sql depends on this fixture.
--   * A third restaurant (Night Owl Noodles) that only filled a 3-minute brief:
--     menu + thin inventory, no sales, null-dollar opportunities. Ember and
--     Sunrise row counts stay the same so existing RLS assertions still pass.
--   * Layer 4 and 5 rows (opportunities, evidence, a campaign, an experiment).
--     At runtime these are written by job-generate-opportunities, which does not
--     exist yet; seeding them is what lets the read paths, the views, and the
--     frontend be tested before the Edge Functions are built. Every score below
--     satisfies the weighted formula in architecture.md §6.4 exactly, and
--     tests/04_scoring.test.sql re-derives them.
--
-- Idempotent: deletes its own rows by fixed UUID, then reinserts. Safe to run
-- repeatedly, locally or against a hosted project.

set search_path = public, extensions;

-- ===========================================================================
-- 0. Reset
-- ===========================================================================
-- Deleting the restaurants cascades through every tenant-owned table.
delete from restaurants where id in (
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001'
);

-- Global tables are not owned by a tenant, so they are cleared explicitly.
delete from trends      where slug in ('hot-honey', 'chili-crisp', 'matcha', 'smash-burger', 'birria');
delete from raw_signals where source_id like 'seed:%';
delete from ingest_runs where id::text like 'c0000000-0000-0000-0000-0000000002%';

-- ===========================================================================
-- 1. Demo auth users
-- ===========================================================================
-- Resolved by email rather than assumed, so this also works on a hosted project
-- where you may have already created the user through the dashboard.
create temp table if not exists seed_owner (key text primary key, user_id uuid);
truncate seed_owner;

do $$
declare
  v_id uuid;
  r record;
begin
  for r in
    select * from (values
      ('a', 'owner@miseenvue.test',  '11111111-1111-1111-1111-111111111111'::uuid, 'Dana Reyes'),
      ('b', 'owner2@miseenvue.test', '22222222-2222-2222-2222-222222222222'::uuid, 'Luis Ortega'),
      ('c', 'owner3@miseenvue.test', '33333333-3333-3333-3333-333333333333'::uuid, 'Mina Cho')
    ) as t(key, email, fallback_id, full_name)
  loop
    select id into v_id from auth.users where email = r.email;

    if v_id is null then
      v_id := r.fallback_id;

      -- confirmation_token, recovery_token, email_change_token_new and
      -- email_change have no column default and GoTrue scans them into Go
      -- strings. Leaving them NULL makes every password sign-in fail with
      -- "Database error querying schema", which looks like a broken schema
      -- rather than a broken seed row.
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        created_at, updated_at
      ) values (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
        r.email, crypt('password123', gen_salt('bf')),
        now(), '{"provider":"email","providers":["email"]}',
        jsonb_build_object('full_name', r.full_name),
        '', '', '', '',
        now(), now()
      );

      insert into auth.identities (
        id, user_id, provider_id, provider, identity_data,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_id, v_id::text, 'email',
        jsonb_build_object(
          'sub', v_id::text, 'email', r.email,
          'email_verified', true, 'phone_verified', false
        ),
        now(), now(), now()
      );
    end if;

    insert into seed_owner (key, user_id) values (r.key, v_id);
  end loop;
end $$;

-- ===========================================================================
-- 2. Layer 1 — restaurants
-- ===========================================================================
insert into restaurants (id, owner_id, name, description, cuisine_type, city, state, timezone)
values
  (
    'a0000000-0000-0000-0000-000000000001',
    (select user_id from seed_owner where key = 'a'),
    'Ember & Rye',
    'Counter-service fried chicken, smoked brisket, and a small coffee bar in the Heights.',
    'American Comfort', 'Houston', 'TX', 'America/Chicago'
  ),
  (
    'b0000000-0000-0000-0000-000000000001',
    (select user_id from seed_owner where key = 'b'),
    'Sunrise Taqueria',
    'Second tenant. Exists so tenant isolation is testable, not to be a full demo.',
    'Mexican', 'Austin', 'TX', 'America/Chicago'
  ),
  (
    'd0000000-0000-0000-0000-000000000001',
    (select user_id from seed_owner where key = 'c'),
    'Night Owl Noodles',
    'Late-night counter noodles in Logan Square. Brief-only tenant: menu and a thin inventory count, no sales history.',
    'Noodles', 'Chicago', 'IL', 'America/Chicago'
  );

update restaurants set
  neighborhood = 'The Heights',
  pride_in = 'Smoked brisket and fried chicken that still tastes like a backyard cookout, not a chain.',
  price_band = 'mid',
  restaurant_type = 'fast_casual',
  primary_goal = 'increase_revenue',
  experiment_budget = 2016,
  max_new_ingredients = 3,
  service_occasions = array['lunch', 'dinner'],
  never_serve = 'tasting menus, raw seafood towers',
  profile_completed_at = now()
where id = 'a0000000-0000-0000-0000-000000000001';

update restaurants set
  neighborhood = 'East Austin',
  pride_in = 'Breakfast tacos and slow-cooked barbacoa, no fusion gimmicks.',
  price_band = 'value',
  restaurant_type = 'fast_casual',
  primary_goal = 'increase_average_order_value',
  experiment_budget = 400,
  max_new_ingredients = 2,
  service_occasions = array['brunch', 'lunch'],
  never_serve = 'sushi, smash burgers',
  profile_completed_at = now()
where id = 'b0000000-0000-0000-0000-000000000001';

update restaurants set
  neighborhood = 'Logan Square',
  pride_in = 'Late-night hand-pulled noodles that still slurp after last call.',
  price_band = 'mid',
  restaurant_type = 'fast_casual',
  primary_goal = 'generate_social_buzz',
  experiment_budget = 600,
  max_new_ingredients = 3,
  service_occasions = array['dinner', 'late_night'],
  never_serve = 'brunch, dessert flights',
  profile_completed_at = now()
where id = 'd0000000-0000-0000-0000-000000000001';

-- ===========================================================================
-- 3. Layer 2 — uploads
-- ===========================================================================
-- Three clean imports plus one deliberately partial one, because a half-failed
-- CSV is the most likely thing to break on stage and uploads.errors is what
-- makes it visible instead of silent.
insert into uploads (id, restaurant_id, kind, storage_path, status, row_count, inserted_count, error_count, errors, uploaded_by, created_at, completed_at)
values
  (
    'a0000000-0000-0000-0000-000000000101',
    'a0000000-0000-0000-0000-000000000001',
    'menu',
    'a0000000-0000-0000-0000-000000000001/menu/1757000000000-menu.csv',
    'succeeded', 12, 12, 0, '[]',
    (select user_id from seed_owner where key = 'a'),
    now() - interval '91 days', now() - interval '91 days'
  ),
  (
    'a0000000-0000-0000-0000-000000000102',
    'a0000000-0000-0000-0000-000000000001',
    'inventory',
    'a0000000-0000-0000-0000-000000000001/inventory/1757000100000-inventory.csv',
    'succeeded', 19, 19, 0, '[]',
    (select user_id from seed_owner where key = 'a'),
    now() - interval '8 days', now() - interval '8 days'
  ),
  (
    'a0000000-0000-0000-0000-000000000103',
    'a0000000-0000-0000-0000-000000000001',
    'sales',
    'a0000000-0000-0000-0000-000000000001/sales/1757000200000-sales-90d.csv',
    'succeeded', 2160, 2160, 0, '[]',
    (select user_id from seed_owner where key = 'a'),
    now() - interval '2 days', now() - interval '2 days'
  ),
  (
    'a0000000-0000-0000-0000-000000000104',
    'a0000000-0000-0000-0000-000000000001',
    'sales',
    'a0000000-0000-0000-0000-000000000001/sales/1757000300000-sales-yesterday.csv',
    'partial', 4, 4, 2,
    '[
      {"row": 3, "code": "unknown_menu_item", "message": "No menu item named ''Wingz''", "value": "Wingz"},
      {"row": 4, "code": "unknown_menu_item", "message": "No menu item named ''Matcha Ltte''", "value": "Matcha Ltte"}
    ]',
    (select user_id from seed_owner where key = 'a'),
    now() - interval '1 day', now() - interval '1 day'
  ),
  (
    'b0000000-0000-0000-0000-000000000101',
    'b0000000-0000-0000-0000-000000000001',
    'menu',
    'b0000000-0000-0000-0000-000000000001/menu/1757000400000-menu.csv',
    'succeeded', 3, 3, 0, '[]',
    (select user_id from seed_owner where key = 'b'),
    now() - interval '30 days', now() - interval '30 days'
  ),
  (
    'd0000000-0000-0000-0000-000000000101',
    'd0000000-0000-0000-0000-000000000001',
    'menu',
    'd0000000-0000-0000-0000-000000000001/menu/1757000500000-menu.csv',
    'succeeded', 8, 8, 0, '[]',
    (select user_id from seed_owner where key = 'c'),
    now() - interval '1 day', now() - interval '1 day'
  );

-- ===========================================================================
-- 4. Layer 2 — menu_items
-- ===========================================================================
-- tags are the MVP matching substrate: keyword overlap against trends.keywords
-- is what stage 3 scores before pgvector exists. Seed them from the menu text.
insert into menu_items (id, restaurant_id, name, description, category, tags, price, estimated_cost)
values
  ('a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000001', 'Crispy Chicken Sandwich',            'Buttermilk-brined thigh, pickles, herb mayo, brioche.',      'Sandwiches', '{chicken,fried,sandwich,crispy,pickles}',            13.50, 4.10),
  ('a0000000-0000-0000-0000-000000000202', 'a0000000-0000-0000-0000-000000000001', 'Nashville Hot Chicken Sandwich',     'Cayenne-lacquered thigh, slaw, brioche.',                    'Sandwiches', '{chicken,fried,sandwich,spicy,hot,nashville}',       14.25, 4.45),
  ('a0000000-0000-0000-0000-000000000203', 'a0000000-0000-0000-0000-000000000001', 'Buttermilk Fried Chicken Tenders',   'Three tenders, honey mustard.',                              'Plates',     '{chicken,fried,tenders,honey}',                     11.75, 3.60),
  ('a0000000-0000-0000-0000-000000000204', 'a0000000-0000-0000-0000-000000000001', 'Classic Cheeseburger',              'Quarter-pound patty, cheddar, griddled onion.',              'Sandwiches', '{burger,beef,cheese,sandwich,griddle}',              12.50, 4.20),
  ('a0000000-0000-0000-0000-000000000205', 'a0000000-0000-0000-0000-000000000001', 'Smoked Brisket Sandwich',           'Twelve-hour brisket, pickles, white bread.',                 'Sandwiches', '{brisket,smoked,beef,sandwich,bbq}',                 16.00, 6.10),
  ('a0000000-0000-0000-0000-000000000206', 'a0000000-0000-0000-0000-000000000001', 'Loaded Waffle Fries',               'Queso, scallion, pickled jalapeno.',                        'Sides',      '{fries,potato,cheese,side,shareable}',                8.25, 2.05),
  ('a0000000-0000-0000-0000-000000000207', 'a0000000-0000-0000-0000-000000000001', 'Buffalo Wings (8 pc)',              'Fried wings tossed in buffalo, ranch on the side.',          'Plates',     '{wings,chicken,spicy,buffalo,shareable}',            13.00, 4.80),
  ('a0000000-0000-0000-0000-000000000208', 'a0000000-0000-0000-0000-000000000001', 'Street Corn Elote Cup',             'Charred corn, cotija, lime, chili salt.',                    'Sides',      '{corn,elote,cheese,side,mexican}',                   6.50, 1.65),
  ('a0000000-0000-0000-0000-000000000209', 'a0000000-0000-0000-0000-000000000001', 'Kale Caesar Salad',                 'Tuscan kale, parmesan, sourdough crumb.',                    'Salads',     '{salad,kale,caesar,greens,healthy}',                 10.50, 2.90),
  ('a0000000-0000-0000-0000-000000000210', 'a0000000-0000-0000-0000-000000000001', 'Matcha Latte',                      'Ceremonial-grade matcha, oat milk.',                         'Drinks',     '{matcha,latte,"green tea",drink,"coffee bar"}',       5.75, 1.35),
  ('a0000000-0000-0000-0000-000000000211', 'a0000000-0000-0000-0000-000000000001', 'Horchata Cold Brew',                'Cold brew cut with cinnamon rice milk.',                     'Drinks',     '{"cold brew",coffee,horchata,drink,iced}',            5.25, 1.10),
  ('a0000000-0000-0000-0000-000000000212', 'a0000000-0000-0000-0000-000000000001', 'Brown Butter Chocolate Chip Cookie','Browned butter, sea salt, bittersweet chocolate.',           'Desserts',   '{cookie,dessert,chocolate,"brown butter",bakery}',    3.75, 0.72),

  ('b0000000-0000-0000-0000-000000000201', 'b0000000-0000-0000-0000-000000000001', 'Barbacoa Taco',                     'Slow-braised beef cheek, onion, cilantro.',                  'Tacos',      '{taco,beef,barbacoa}',                               3.95, 1.20),
  ('b0000000-0000-0000-0000-000000000202', 'b0000000-0000-0000-0000-000000000001', 'Breakfast Migas Taco',              'Egg, tortilla chips, cheese, salsa roja.',                   'Tacos',      '{taco,breakfast,egg,migas}',                         3.50, 0.95),
  ('b0000000-0000-0000-0000-000000000203', 'b0000000-0000-0000-0000-000000000001', 'Agua Fresca',                       'Rotating fruit, house-made daily.',                          'Drinks',     '{drink,"agua fresca",fruit}',                        3.25, 0.55),

  ('d0000000-0000-0000-0000-000000000201', 'd0000000-0000-0000-0000-000000000001', 'Chili Oil Noodles',                 'Hand-cut wheat noodles, chili oil, garlic, scallion.',       'Bowls',      '{noodles,chili,spicy,"chili oil"}',                  14.50, 4.20),
  ('d0000000-0000-0000-0000-000000000202', 'd0000000-0000-0000-0000-000000000001', 'Pho Bo',                            'Beef brisket pho, herbs, lime.',                             'Bowls',      '{pho,beef,broth,noodles}',                           13.75, 3.80),
  ('d0000000-0000-0000-0000-000000000203', 'd0000000-0000-0000-0000-000000000001', 'Crispy Rice Bowl',                  'Soy egg, cucumber, chili oil drizzle.',                      'Bowls',      '{rice,crispy,bowl,"chili oil"}',                     12.50, 3.40),
  ('d0000000-0000-0000-0000-000000000204', 'd0000000-0000-0000-0000-000000000001', 'Garlic Green Beans',                'Wok-blistered beans, fried garlic.',                         'Sides',      '{beans,garlic,side,vegetable}',                       6.50, 1.40),
  ('d0000000-0000-0000-0000-000000000205', 'd0000000-0000-0000-0000-000000000001', 'Pork Bao',                          'Steamed bun, braised pork, pickle.',                         'Snacks',     '{bao,pork,bun,snack}',                                7.25, 2.10),
  ('d0000000-0000-0000-0000-000000000206', 'd0000000-0000-0000-0000-000000000001', 'Iced Coffee',                       'House cold brew, condensed milk optional.',                  'Drinks',     '{coffee,iced,drink}',                                 4.50, 0.85),
  ('d0000000-0000-0000-0000-000000000207', 'd0000000-0000-0000-0000-000000000001', 'Lime Soda',                         'Lime, soda, simple syrup.',                                  'Drinks',     '{soda,lime,drink}',                                   3.75, 0.55),
  ('d0000000-0000-0000-0000-000000000208', 'd0000000-0000-0000-0000-000000000001', 'Sesame Cucumber',                   'Smashed cucumber, sesame, chili salt.',                      'Sides',      '{cucumber,sesame,side}',                              5.50, 1.10);

-- ===========================================================================
-- 5. Layer 2 — ingredients (the catalog, not stock on hand)
-- ===========================================================================
-- Note what is absent: chili flakes. That gap is deliberate -- it is what makes
-- the hot-honey opportunity in section 10 score operational_fit 80 with exactly
-- one nameable missing item, which is the difference between a number and an
-- action a chef can take this afternoon.
insert into ingredients (id, restaurant_id, name, unit, unit_cost)
values
  ('a0000000-0000-0000-0000-000000000301', 'a0000000-0000-0000-0000-000000000001', 'chicken thigh',        'lb',   3.2500),
  ('a0000000-0000-0000-0000-000000000302', 'a0000000-0000-0000-0000-000000000001', 'chicken wings',        'lb',   2.8500),
  ('a0000000-0000-0000-0000-000000000303', 'a0000000-0000-0000-0000-000000000001', 'brioche bun',          'each', 0.5500),
  ('a0000000-0000-0000-0000-000000000304', 'a0000000-0000-0000-0000-000000000001', 'pickles',              'gal', 12.0000),
  ('a0000000-0000-0000-0000-000000000305', 'a0000000-0000-0000-0000-000000000001', 'honey',                'lb',   4.7500),
  ('a0000000-0000-0000-0000-000000000306', 'a0000000-0000-0000-0000-000000000001', 'buttermilk',           'gal',  6.4000),
  ('a0000000-0000-0000-0000-000000000307', 'a0000000-0000-0000-0000-000000000001', 'all-purpose flour',    'lb',   0.6200),
  ('a0000000-0000-0000-0000-000000000308', 'a0000000-0000-0000-0000-000000000001', 'hot sauce',            'gal', 18.5000),
  ('a0000000-0000-0000-0000-000000000309', 'a0000000-0000-0000-0000-000000000001', 'ground beef',          'lb',   5.1000),
  ('a0000000-0000-0000-0000-000000000310', 'a0000000-0000-0000-0000-000000000001', 'cheddar cheese',       'lb',   4.9500),
  ('a0000000-0000-0000-0000-000000000311', 'a0000000-0000-0000-0000-000000000001', 'smoked brisket',       'lb',   9.8000),
  ('a0000000-0000-0000-0000-000000000312', 'a0000000-0000-0000-0000-000000000001', 'waffle fries',         'lb',   1.4500),
  ('a0000000-0000-0000-0000-000000000313', 'a0000000-0000-0000-0000-000000000001', 'sweet corn',           'lb',   1.2000),
  ('a0000000-0000-0000-0000-000000000314', 'a0000000-0000-0000-0000-000000000001', 'cotija cheese',        'lb',   6.2500),
  ('a0000000-0000-0000-0000-000000000315', 'a0000000-0000-0000-0000-000000000001', 'kale',                 'lb',   2.3000),
  ('a0000000-0000-0000-0000-000000000316', 'a0000000-0000-0000-0000-000000000001', 'matcha powder',        'oz',   3.9000),
  ('a0000000-0000-0000-0000-000000000317', 'a0000000-0000-0000-0000-000000000001', 'oat milk',             'gal',  7.2500),
  ('a0000000-0000-0000-0000-000000000318', 'a0000000-0000-0000-0000-000000000001', 'cold brew concentrate','gal', 22.0000),
  ('a0000000-0000-0000-0000-000000000319', 'a0000000-0000-0000-0000-000000000001', 'butter',               'lb',   4.4000),
  ('a0000000-0000-0000-0000-000000000320', 'a0000000-0000-0000-0000-000000000001', 'chocolate chips',      'lb',   5.6000),

  ('b0000000-0000-0000-0000-000000000301', 'b0000000-0000-0000-0000-000000000001', 'beef cheek',           'lb',   6.8000),
  ('b0000000-0000-0000-0000-000000000302', 'b0000000-0000-0000-0000-000000000001', 'corn tortilla',        'each', 0.1200),

  ('d0000000-0000-0000-0000-000000000301', 'd0000000-0000-0000-0000-000000000001', 'wheat noodles',        'lb',   1.8500),
  ('d0000000-0000-0000-0000-000000000302', 'd0000000-0000-0000-0000-000000000001', 'rice noodles',         'lb',   1.6000),
  ('d0000000-0000-0000-0000-000000000303', 'd0000000-0000-0000-0000-000000000001', 'chili oil',            'lb',   6.5000),
  ('d0000000-0000-0000-0000-000000000304', 'd0000000-0000-0000-0000-000000000001', 'beef brisket',         'lb',   8.4000),
  ('d0000000-0000-0000-0000-000000000305', 'd0000000-0000-0000-0000-000000000001', 'jasmine rice',         'lb',   1.1000),
  ('d0000000-0000-0000-0000-000000000306', 'd0000000-0000-0000-0000-000000000001', 'coffee beans',         'lb',   9.2000);

-- ===========================================================================
-- 6. Layer 2 — menu_item_ingredients (drives operational_fit)
-- ===========================================================================
insert into menu_item_ingredients (menu_item_id, ingredient_id, quantity)
values
  -- Crispy Chicken Sandwich
  ('a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000301', 0.3500),
  ('a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000303', 1.0000),
  ('a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000304', 0.0150),
  ('a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000306', 0.0100),
  ('a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000307', 0.1200),
  -- Nashville Hot Chicken Sandwich
  ('a0000000-0000-0000-0000-000000000202', 'a0000000-0000-0000-0000-000000000301', 0.3500),
  ('a0000000-0000-0000-0000-000000000202', 'a0000000-0000-0000-0000-000000000303', 1.0000),
  ('a0000000-0000-0000-0000-000000000202', 'a0000000-0000-0000-0000-000000000308', 0.0080),
  ('a0000000-0000-0000-0000-000000000202', 'a0000000-0000-0000-0000-000000000307', 0.1200),
  -- Buttermilk Fried Chicken Tenders
  ('a0000000-0000-0000-0000-000000000203', 'a0000000-0000-0000-0000-000000000301', 0.3000),
  ('a0000000-0000-0000-0000-000000000203', 'a0000000-0000-0000-0000-000000000306', 0.0120),
  ('a0000000-0000-0000-0000-000000000203', 'a0000000-0000-0000-0000-000000000307', 0.1000),
  ('a0000000-0000-0000-0000-000000000203', 'a0000000-0000-0000-0000-000000000305', 0.0300),
  -- Classic Cheeseburger
  ('a0000000-0000-0000-0000-000000000204', 'a0000000-0000-0000-0000-000000000309', 0.2500),
  ('a0000000-0000-0000-0000-000000000204', 'a0000000-0000-0000-0000-000000000310', 0.0600),
  ('a0000000-0000-0000-0000-000000000204', 'a0000000-0000-0000-0000-000000000303', 1.0000),
  -- Smoked Brisket Sandwich
  ('a0000000-0000-0000-0000-000000000205', 'a0000000-0000-0000-0000-000000000311', 0.4000),
  ('a0000000-0000-0000-0000-000000000205', 'a0000000-0000-0000-0000-000000000304', 0.0150),
  -- Loaded Waffle Fries
  ('a0000000-0000-0000-0000-000000000206', 'a0000000-0000-0000-0000-000000000312', 0.4500),
  ('a0000000-0000-0000-0000-000000000206', 'a0000000-0000-0000-0000-000000000310', 0.0800),
  -- Buffalo Wings
  ('a0000000-0000-0000-0000-000000000207', 'a0000000-0000-0000-0000-000000000302', 0.7500),
  ('a0000000-0000-0000-0000-000000000207', 'a0000000-0000-0000-0000-000000000308', 0.0100),
  -- Street Corn Elote Cup
  ('a0000000-0000-0000-0000-000000000208', 'a0000000-0000-0000-0000-000000000313', 0.3000),
  ('a0000000-0000-0000-0000-000000000208', 'a0000000-0000-0000-0000-000000000314', 0.0500),
  -- Kale Caesar Salad
  ('a0000000-0000-0000-0000-000000000209', 'a0000000-0000-0000-0000-000000000315', 0.2500),
  -- Matcha Latte
  ('a0000000-0000-0000-0000-000000000210', 'a0000000-0000-0000-0000-000000000316', 0.2500),
  ('a0000000-0000-0000-0000-000000000210', 'a0000000-0000-0000-0000-000000000317', 0.0400),
  -- Horchata Cold Brew
  ('a0000000-0000-0000-0000-000000000211', 'a0000000-0000-0000-0000-000000000318', 0.0300),
  -- Brown Butter Chocolate Chip Cookie
  ('a0000000-0000-0000-0000-000000000212', 'a0000000-0000-0000-0000-000000000319', 0.0400),
  ('a0000000-0000-0000-0000-000000000212', 'a0000000-0000-0000-0000-000000000320', 0.0500),
  ('a0000000-0000-0000-0000-000000000212', 'a0000000-0000-0000-0000-000000000307', 0.0900),

  ('b0000000-0000-0000-0000-000000000201', 'b0000000-0000-0000-0000-000000000301', 0.2000),
  ('b0000000-0000-0000-0000-000000000201', 'b0000000-0000-0000-0000-000000000302', 2.0000),

  ('d0000000-0000-0000-0000-000000000201', 'd0000000-0000-0000-0000-000000000301', 0.4000),
  ('d0000000-0000-0000-0000-000000000201', 'd0000000-0000-0000-0000-000000000303', 0.0400),
  ('d0000000-0000-0000-0000-000000000202', 'd0000000-0000-0000-0000-000000000302', 0.3500),
  ('d0000000-0000-0000-0000-000000000202', 'd0000000-0000-0000-0000-000000000304', 0.2500),
  ('d0000000-0000-0000-0000-000000000203', 'd0000000-0000-0000-0000-000000000305', 0.3000),
  ('d0000000-0000-0000-0000-000000000203', 'd0000000-0000-0000-0000-000000000303', 0.0200),
  ('d0000000-0000-0000-0000-000000000206', 'd0000000-0000-0000-0000-000000000306', 0.0300);

-- ===========================================================================
-- 7. Layer 2 — inventory_counts (append-only)
-- ===========================================================================
-- Two counts for chicken thigh, 14 days apart. current_inventory must return
-- only the newer one; tests/02_views.test.sql asserts exactly that.
insert into inventory_counts (restaurant_id, ingredient_id, quantity_on_hand, unit, counted_at, upload_id)
select
  'a0000000-0000-0000-0000-000000000001',
  i.id,
  v.qty,
  i.unit,
  now() - interval '8 days',
  'a0000000-0000-0000-0000-000000000102'
from (values
  ('a0000000-0000-0000-0000-000000000301'::uuid,  48.0000),
  ('a0000000-0000-0000-0000-000000000302'::uuid,  32.0000),
  ('a0000000-0000-0000-0000-000000000303'::uuid, 240.0000),
  ('a0000000-0000-0000-0000-000000000304'::uuid,   3.5000),
  ('a0000000-0000-0000-0000-000000000305'::uuid,   6.0000),
  ('a0000000-0000-0000-0000-000000000306'::uuid,   4.0000),
  ('a0000000-0000-0000-0000-000000000307'::uuid,  50.0000),
  ('a0000000-0000-0000-0000-000000000308'::uuid,   2.0000),
  ('a0000000-0000-0000-0000-000000000309'::uuid,  36.0000),
  ('a0000000-0000-0000-0000-000000000310'::uuid,  18.0000),
  ('a0000000-0000-0000-0000-000000000311'::uuid,  22.0000),
  ('a0000000-0000-0000-0000-000000000312'::uuid,  60.0000),
  ('a0000000-0000-0000-0000-000000000313'::uuid,  25.0000),
  ('a0000000-0000-0000-0000-000000000314'::uuid,   8.0000),
  ('a0000000-0000-0000-0000-000000000315'::uuid,  12.0000),
  ('a0000000-0000-0000-0000-000000000316'::uuid,  16.0000),
  ('a0000000-0000-0000-0000-000000000317'::uuid,   5.0000),
  ('a0000000-0000-0000-0000-000000000318'::uuid,   3.0000),
  ('a0000000-0000-0000-0000-000000000319'::uuid,  20.0000)
) as v(ingredient_id, qty)
join ingredients i on i.id = v.ingredient_id;

-- The superseded count, deliberately older.
insert into inventory_counts (restaurant_id, ingredient_id, quantity_on_hand, unit, counted_at, upload_id)
values (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000301',
  11.0000, 'lb',
  now() - interval '22 days',
  null
);

insert into inventory_counts (restaurant_id, ingredient_id, quantity_on_hand, unit, counted_at)
values (
  'b0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000301',
  14.0000, 'lb',
  now() - interval '3 days'
);

insert into inventory_counts (restaurant_id, ingredient_id, quantity_on_hand, unit, counted_at)
values
  ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000301', 22.0000, 'lb', now() - interval '1 day'),
  ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000302', 18.0000, 'lb', now() - interval '1 day'),
  ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000303',  0.4000, 'lb', now() - interval '1 day'),
  ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000304', 14.0000, 'lb', now() - interval '1 day'),
  ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000305', 40.0000, 'lb', now() - interval '1 day'),
  ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000306',  8.0000, 'lb', now() - interval '1 day');

-- ===========================================================================
-- 8. Layer 2 — sales: 90 local days, two dayparts, weekday/weekend variation
-- ===========================================================================
-- Weekday variation is not decoration. Without it the day-of-week baseline in
-- menu_item_baselines is untestable, and the baseline is what the entire
-- experiment layer rests on.
--
-- Quantities are deterministic, derived from md5 of (item, date, daypart) rather
-- than random(), so `supabase db reset` twice produces byte-identical numbers
-- and a failing test means a real regression.
with day_series as (
  select g::date as local_date, extract(isodow from g)::int as dow
  from generate_series(
         current_date - interval '90 days',
         current_date - interval '1 day',
         interval '1 day'
       ) g
),
dow_factor(dow, f) as (
  values (1, 0.82::numeric), (2, 0.86), (3, 0.94), (4, 1.06), (5, 1.38), (6, 1.45), (7, 1.02)
),
item_base(item_id, base_units) as (
  values
    ('a0000000-0000-0000-0000-000000000201'::uuid, 46),
    ('a0000000-0000-0000-0000-000000000202'::uuid, 28),
    ('a0000000-0000-0000-0000-000000000203'::uuid, 22),
    ('a0000000-0000-0000-0000-000000000204'::uuid, 31),
    ('a0000000-0000-0000-0000-000000000205'::uuid, 18),
    ('a0000000-0000-0000-0000-000000000206'::uuid, 34),
    ('a0000000-0000-0000-0000-000000000207'::uuid, 25),
    ('a0000000-0000-0000-0000-000000000208'::uuid, 16),
    ('a0000000-0000-0000-0000-000000000209'::uuid, 12),
    ('a0000000-0000-0000-0000-000000000210'::uuid, 20),
    ('a0000000-0000-0000-0000-000000000211'::uuid, 15),
    ('a0000000-0000-0000-0000-000000000212'::uuid, 26)
),
dayparts(part, local_hour, share) as (
  values ('lunch', 11, 0.45::numeric), ('dinner', 18, 0.55)
),
draw as (
  select
    ib.item_id,
    ds.local_date,
    dp.part,
    dp.local_hour,
    mi.price,
    ib.base_units * df.f * dp.share as expected,
    (abs(('x' || substr(md5(ib.item_id::text || ds.local_date::text || dp.part), 1, 8))::bit(32)::int % 1000))::numeric / 1000 as r1,
     abs(('x' || substr(md5(dp.part || ds.local_date::text || ib.item_id::text), 1, 8))::bit(32)::int % 100)                  as r2
  from day_series ds
  join dow_factor df on df.dow = ds.dow
  cross join item_base ib
  cross join dayparts dp
  join menu_items mi on mi.id = ib.item_id
)
insert into sales (restaurant_id, menu_item_id, sold_at, quantity, revenue, channel, upload_id)
select
  'a0000000-0000-0000-0000-000000000001',
  d.item_id,
  (d.local_date + make_interval(hours => d.local_hour, mins => (d.r1 * 170)::int))
    at time zone 'America/Chicago',
  q.quantity,
  round(q.quantity * d.price, 2),
  (case
     when d.r2 < 58 then 'in_store'
     when d.r2 < 78 then 'online'
     when d.r2 < 92 then 'doordash'
     else 'ubereats'
   end)::sales_channel,
  'a0000000-0000-0000-0000-000000000103'
from draw d
cross join lateral (
  select greatest(1, round(d.expected * (0.78 + 0.44 * d.r1))::int) as quantity
) q;

-- One deliberate 23:40-local Friday sale. In UTC this lands on Saturday, so it
-- is the row that proves menu_item_daily_sales buckets by the restaurant's local
-- day and not by UTC. tests/02_views.test.sql asserts it.
with last_friday as (
  select max(g)::date as local_date
  from generate_series(
         current_date - interval '20 days',
         current_date - interval '2 days',
         interval '1 day'
       ) g
  where extract(isodow from g) = 5
)
insert into sales (restaurant_id, menu_item_id, sold_at, quantity, revenue, channel, upload_id)
select
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000201',
  (lf.local_date + time '23:40') at time zone 'America/Chicago',
  3,
  40.50,
  'in_store',
  'a0000000-0000-0000-0000-000000000103'
from last_friday lf;

-- Two rows from the partial upload whose item name did not resolve. Nullable
-- menu_item_id is what keeps revenue totals correct while leaving the link
-- honestly missing; the names are recorded in uploads.errors, not invented as
-- new menu items.
insert into sales (restaurant_id, menu_item_id, sold_at, quantity, revenue, channel, upload_id)
values
  ('a0000000-0000-0000-0000-000000000001', null, now() - interval '1 day', 2, 26.00, 'online',   'a0000000-0000-0000-0000-000000000104'),
  ('a0000000-0000-0000-0000-000000000001', null, now() - interval '1 day', 1,  5.75, 'in_store', 'a0000000-0000-0000-0000-000000000104');

-- Second tenant: enough sales to be non-empty, not enough to be a demo.
with day_series as (
  select g::date as local_date, extract(isodow from g)::int as dow
  from generate_series(current_date - interval '30 days', current_date - interval '1 day', interval '1 day') g
),
item_base(item_id, base_units) as (
  values
    ('b0000000-0000-0000-0000-000000000201'::uuid, 55),
    ('b0000000-0000-0000-0000-000000000202'::uuid, 40),
    ('b0000000-0000-0000-0000-000000000203'::uuid, 22)
)
insert into sales (restaurant_id, menu_item_id, sold_at, quantity, revenue, channel)
select
  'b0000000-0000-0000-0000-000000000001',
  ib.item_id,
  (ds.local_date + time '12:15') at time zone 'America/Chicago',
  q.quantity,
  round(q.quantity * mi.price, 2),
  'in_store'
from day_series ds
cross join item_base ib
join menu_items mi on mi.id = ib.item_id
cross join lateral (
  select greatest(
    1,
    round(ib.base_units * (case when ds.dow in (6, 7) then 1.30 else 0.95 end))::int
  ) as quantity
) q;

-- ===========================================================================
-- 9. Layer 3 — the external world (global: no restaurant_id anywhere)
-- ===========================================================================
insert into ingest_runs (id, source, status, fetched_count, new_count, error, started_at, finished_at)
values
  ('c0000000-0000-0000-0000-000000000201', 'google_trends', 'succeeded',  24,  6, null,                                   now() - interval '2 days',  now() - interval '2 days'  + interval '41 seconds'),
  ('c0000000-0000-0000-0000-000000000202', 'reddit',        'succeeded', 180,  6, null,                                   now() - interval '2 days',  now() - interval '2 days'  + interval '2 minutes'),
  ('c0000000-0000-0000-0000-000000000203', 'tiktok',        'succeeded',  60,  3, null,                                   now() - interval '1 day',   now() - interval '1 day'   + interval '55 seconds'),
  ('c0000000-0000-0000-0000-000000000204', 'local_events',  'succeeded',  12,  2, null,                                   now() - interval '1 day',   now() - interval '1 day'   + interval '12 seconds'),
  -- A failed run, so the adapter-health read path has something to show.
  ('c0000000-0000-0000-0000-000000000205', 'reddit',        'failed',      0,  0, 'HTTP 429 from oauth.reddit.com after 3 retries', now() - interval '6 hours', now() - interval '6 hours' + interval '18 seconds');

insert into trends (id, name, slug, description, category, keywords, trend_score, trend_velocity, region, status, first_detected_at, last_updated_at)
values
  ('c0000000-0000-0000-0000-000000000001', 'Hot Honey',        'hot-honey',    'Chili-infused honey drizzled over fried chicken, pizza, and biscuits.', 'ingredient', '{"hot honey","spicy honey",honey,"chili honey","hot honey chicken"}', 87.00,  0.4300, 'Houston, TX', 'active', now() - interval '74 days', now() - interval '1 day'),
  ('c0000000-0000-0000-0000-000000000002', 'Chili Crisp',      'chili-crisp',  'Crunchy chili oil condiment moving from pantry staple to menu headline.', 'ingredient', '{"chili crisp","chili oil","crunchy chili","spicy oil"}',             78.00,  0.3100, null,          'active', now() - interval '120 days', now() - interval '1 day'),
  ('c0000000-0000-0000-0000-000000000003', 'Matcha Everything','matcha',       'Matcha moving beyond lattes into desserts, sodas, and sauces.',          'drink',      '{matcha,"green tea","matcha latte","ceremonial matcha"}',             82.00,  0.5500, null,          'active', now() - interval '61 days', now() - interval '1 day'),
  ('c0000000-0000-0000-0000-000000000004', 'Smash Burgers',    'smash-burger', 'Thin, crispy-edged griddle patties displacing thick pub burgers.',       'food',       '{"smash burger",burger,"crispy edges","griddle burger"}',             64.00,  0.0800, 'Houston, TX', 'active', now() - interval '210 days', now() - interval '1 day'),
  -- Fading, with negative velocity: gives the feed something that should rank low.
  ('c0000000-0000-0000-0000-000000000005', 'Birria Tacos',     'birria',       'Consome-dipped braised beef tacos, past peak but still ordering well.',  'food',       '{birria,"birria tacos",consome,quesabirria}',                         71.00, -0.0500, 'Houston, TX', 'fading', now() - interval '400 days', now() - interval '2 days');

-- raw_signals staged in a temp table so trend_signals can be derived from the
-- same rows, which is how the normalize stage will do it: read unprocessed
-- raw_signals, write trend_signals, stamp processed_at.
create temp table if not exists seed_raw (
  id            uuid,
  source        signal_source,
  source_id     text,
  run_id        uuid,
  query         text,
  region        text,
  days_ago      int,
  payload       jsonb,
  trend_slug    text,
  signal_value  numeric(5,2),
  growth_rate   numeric(6,4),
  processed     boolean
);
truncate seed_raw;

insert into seed_raw values
  -- hot honey
  ('c0000000-0000-0000-0000-000000000101', 'google_trends', 'seed:gt:hot-honey:2026-W35',      'c0000000-0000-0000-0000-000000000201', 'hot honey',   'Houston, TX', 9, '{"index":68,"timeframe":"2026-W35","geo":"US-TX-618"}',                                                      'hot-honey',    68.00,  0.2600, true),
  ('c0000000-0000-0000-0000-000000000102', 'google_trends', 'seed:gt:hot-honey:2026-W36',      'c0000000-0000-0000-0000-000000000201', 'hot honey',   'Houston, TX', 2, '{"index":91,"timeframe":"2026-W36","geo":"US-TX-618"}',                                                      'hot-honey',    91.00,  0.4300, true),
  ('c0000000-0000-0000-0000-000000000103', 'reddit',        'seed:reddit:1n4x9qz',             'c0000000-0000-0000-0000-000000000202', null,          'Houston, TX', 4, '{"subreddit":"houstonfood","title":"The hot honey chicken sandwich at the new Heights spot is unreal","ups":842,"num_comments":137}', 'hot-honey', 84.00,  0.5100, true),
  ('c0000000-0000-0000-0000-000000000104', 'tiktok',        'seed:tiktok:7412998877665544',    'c0000000-0000-0000-0000-000000000203', 'hot honey',   null,          1, '{"views":2140000,"likes":318000,"caption":"hot honey on everything challenge day 4"}',                       'hot-honey',    88.00,  0.6200, true),
  -- chili crisp
  ('c0000000-0000-0000-0000-000000000105', 'google_trends', 'seed:gt:chili-crisp:2026-W36',    'c0000000-0000-0000-0000-000000000201', 'chili crisp', null,          2, '{"index":74,"timeframe":"2026-W36","geo":"US"}',                                                             'chili-crisp',  74.00,  0.2200, true),
  ('c0000000-0000-0000-0000-000000000106', 'reddit',        'seed:reddit:1n2b7kk',             'c0000000-0000-0000-0000-000000000202', null,          null,          5, '{"subreddit":"FoodPorn","title":"Chili crisp wings are the only wings now","ups":1512,"num_comments":204}',   'chili-crisp',  81.00,  0.3400, true),
  ('c0000000-0000-0000-0000-000000000107', 'tiktok',        'seed:tiktok:7411223344556677',    'c0000000-0000-0000-0000-000000000203', 'chili crisp', null,          3, '{"views":980000,"likes":141000,"caption":"chili crisp honey wings"}',                                        'chili-crisp',  79.00,  0.3700, true),
  -- matcha
  ('c0000000-0000-0000-0000-000000000108', 'google_trends', 'seed:gt:matcha:2026-W36',         'c0000000-0000-0000-0000-000000000201', 'matcha',      null,          2, '{"index":86,"timeframe":"2026-W36","geo":"US"}',                                                             'matcha',       86.00,  0.4900, true),
  ('c0000000-0000-0000-0000-000000000109', 'tiktok',        'seed:tiktok:7410010101010101',    'c0000000-0000-0000-0000-000000000203', 'matcha',      null,          1, '{"views":4310000,"likes":702000,"caption":"iced matcha cream latte recipe"}',                                'matcha',       93.00,  0.6800, true),
  ('c0000000-0000-0000-0000-000000000110', 'reddit',        'seed:reddit:1n5p2mm',             'c0000000-0000-0000-0000-000000000202', null,          null,          7, '{"subreddit":"cafe","title":"Matcha is now 30% of our morning drink sales","ups":403,"num_comments":88}',     'matcha',       71.00,  0.3900, true),
  -- smash burger
  ('c0000000-0000-0000-0000-000000000111', 'google_trends', 'seed:gt:smash-burger:2026-W36',   'c0000000-0000-0000-0000-000000000201', 'smash burger','Houston, TX', 2, '{"index":63,"timeframe":"2026-W36","geo":"US-TX-618"}',                                                      'smash-burger', 63.00,  0.0600, true),
  ('c0000000-0000-0000-0000-000000000112', 'local_events',  'seed:events:htx-burger-week-2026','c0000000-0000-0000-0000-000000000204', null,          'Houston, TX', 1, '{"event":"Houston Burger Week","starts_on":"2026-09-21","venues":42}',                                       'smash-burger', 66.00,  0.1100, true),
  -- birria
  ('c0000000-0000-0000-0000-000000000113', 'google_trends', 'seed:gt:birria:2026-W36',         'c0000000-0000-0000-0000-000000000201', 'birria',      'Houston, TX', 2, '{"index":70,"timeframe":"2026-W36","geo":"US-TX-618"}',                                                      'birria',       70.00, -0.0400, true),
  ('c0000000-0000-0000-0000-000000000114', 'reddit',        'seed:reddit:1n0aa11',             'c0000000-0000-0000-0000-000000000202', null,          'Houston, TX', 8, '{"subreddit":"houston","title":"Best birria in town, 2026 edition","ups":690,"num_comments":151}',            'birria',       72.00, -0.0600, true),
  -- Unprocessed backlog: raw_signals with processed_at null and no trend_signal
  -- yet. This is the queue that raw_signals_unprocessed_idx serves, and what
  -- job-ingest-trends' normalize stage will pick up.
  ('c0000000-0000-0000-0000-000000000115', 'reddit',        'seed:reddit:1n9zz99',             'c0000000-0000-0000-0000-000000000202', null,          'Houston, TX', 0, '{"subreddit":"houstonfood","title":"Ube everything is coming","ups":214,"num_comments":39}',                 null,           null,   null,   false),
  ('c0000000-0000-0000-0000-000000000116', 'tiktok',        'seed:tiktok:7413000000000001',    'c0000000-0000-0000-0000-000000000203', 'ube',         null,          0, '{"views":512000,"likes":77000,"caption":"ube cheesecake but make it a cookie"}',                             null,           null,   null,   false),
  ('c0000000-0000-0000-0000-000000000117', 'local_events',  'seed:events:htx-night-market-11', 'c0000000-0000-0000-0000-000000000204', null,          'Houston, TX', 0, '{"event":"Heights Night Market","starts_on":"2026-09-27","vendors":61}',                                     null,           null,   null,   false);

insert into raw_signals (id, source, source_id, ingest_run_id, query, region, observed_at, payload, fetched_at, processed_at)
select
  sr.id, sr.source, sr.source_id, sr.run_id, sr.query, sr.region,
  now() - make_interval(days => sr.days_ago),
  sr.payload,
  now() - make_interval(days => sr.days_ago) + interval '2 hours',
  case when sr.processed then now() - make_interval(days => sr.days_ago) + interval '3 hours' end
from seed_raw sr;

insert into trend_signals (trend_id, raw_signal_id, source, signal_value, growth_rate, observed_at, metadata)
select
  t.id, sr.id, sr.source, sr.signal_value, sr.growth_rate,
  now() - make_interval(days => sr.days_ago),
  jsonb_build_object('source_id', sr.source_id)
from seed_raw sr
join trends t on t.slug = sr.trend_slug
where sr.processed;

-- ===========================================================================
-- 10. Layer 4 — opportunities and evidence
-- ===========================================================================
-- At runtime job-generate-opportunities writes these. Seeded here so the feed,
-- the evidence panel, and the campaign flow are testable before that function
-- exists.
--
-- Every overall_score below is the exact weighted sum from architecture.md §6.4:
--   0.25*trend + 0.15*local + 0.20*menu_fit + 0.15*operational + 0.25*profit
-- tests/04_scoring.test.sql recomputes all five and fails on any drift, which is
-- also how a mistyped weight gets caught -- a bad weight still yields a value
-- inside 0-100, so every check constraint would happily pass.
insert into opportunities (
  id, restaurant_id, trend_id, menu_item_id,
  trend_score, local_relevance_score, menu_fit_score, operational_fit_score, profitability_score, overall_score,
  scoring_version,
  suggested_name, suggested_price, estimated_cost,
  estimated_incremental_revenue, estimated_incremental_profit,
  recommendation, missing_ingredients, status, created_at
) values
  (
    'a0000000-0000-0000-0000-000000000401',
    'a0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000201',
    87.00, 100.00, 94.00, 80.00, 72.00, 85.55,
    'v1',
    'Hot Honey Crispy Chicken Sandwich', 15.00, 4.55,
    1284.00, 412.35,
    'Run your Crispy Chicken Sandwich with a hot honey drizzle at $15.00 for two weeks. Search interest in Houston is up 43% and you already stock everything except chili flakes.',
    '{"chili flakes"}', 'new', now() - interval '1 day'
  ),
  (
    'a0000000-0000-0000-0000-000000000402',
    'a0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000207',
    78.00, 60.00, 61.00, 60.00, 80.00, 69.70,
    'v1',
    'Chili Crisp Wings', 14.50, 5.05,
    742.50, 268.20,
    'Add a chili crisp toss as a third wing flavor. National interest is climbing and the toss adds $0.25 of cost against a $1.50 price increase.',
    '{"chili crisp"}', 'new', now() - interval '1 day'
  ),
  (
    'a0000000-0000-0000-0000-000000000403',
    'a0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000210',
    82.00, 60.00, 88.00, 100.00, 76.00, 81.10,
    'v1',
    'Iced Matcha Cream Latte', 6.50, 1.60,
    486.00, 214.60,
    'You already run matcha and oat milk. An iced cream-top version needs no new inventory and carries a 75% margin.',
    '{}', 'viewed', now() - interval '3 days'
  ),
  (
    'a0000000-0000-0000-0000-000000000404',
    'a0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000204',
    64.00, 100.00, 79.00, 100.00, 68.00, 78.80,
    'v1',
    'Double Smash Burger', 14.00, 5.30,
    903.00, 331.05,
    'Houston Burger Week starts in nine days. Smash the existing patty thin, double it, and list it as a limited run.',
    '{}', 'accepted', now() - interval '10 days'
  ),
  -- menu_item_id null: a trend with no matching item on this menu. This row is
  -- why opportunities_unique_pairing needs `nulls not distinct` -- under default
  -- NULL handling it could be inserted unboundedly many times. Financials are
  -- null because there is no baseline to project from, which is the correct
  -- answer rather than an invented number.
  (
    'a0000000-0000-0000-0000-000000000405',
    'a0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000005',
    null,
    71.00, 100.00, 32.00, 60.00, 55.00, 61.90,
    'v1',
    'Birria Grilled Cheese', 13.50, null,
    null, null,
    'Birria is fading but still strong locally, and nothing on your menu is close to it. Treat this as a weekend special, not a menu change.',
    '{"beef chuck","dried chiles","oaxaca cheese"}', 'new', now() - interval '2 days'
  );

-- Second tenant gets one opportunity so the RLS tests are asserting against a
-- non-empty other side rather than an empty table.
insert into opportunities (
  id, restaurant_id, trend_id, menu_item_id,
  trend_score, local_relevance_score, menu_fit_score, operational_fit_score, profitability_score, overall_score,
  suggested_name, suggested_price, estimated_cost, recommendation, status
) values (
  'b0000000-0000-0000-0000-000000000401',
  'b0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000005',
  'b0000000-0000-0000-0000-000000000201',
  71.00, 60.00, 91.00, 100.00, 64.00, 75.95,
  'Quesabirria Taco', 5.25, 1.65,
  'Your barbacoa braise is most of the way to birria already.', 'new'
);

-- Night Owl: brief-only. Matching dishes exist, but there is no sales
-- history, so incremental dollars stay null. Do not invent a baseline.
insert into opportunities (
  id, restaurant_id, trend_id, menu_item_id,
  trend_score, local_relevance_score, menu_fit_score, operational_fit_score, profitability_score, overall_score,
  suggested_name, suggested_price, estimated_cost,
  estimated_incremental_revenue, estimated_incremental_profit,
  recommendation, missing_ingredients, status, created_at
) values
  (
    'd0000000-0000-0000-0000-000000000401',
    'd0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000002',
    'd0000000-0000-0000-0000-000000000201',
    78.00, 55.00, 91.00, 70.00, 68.00, 73.45,
    'Chili Crisp Noodles', 15.50, 4.45,
    null, null,
    'You already run chili oil noodles. A chili crisp finish is a small menu change, but chili oil is almost gone and you do not stock chili crisp. No sales history yet, so treat this as a weekend test, not a dollar forecast.',
    '{"chili crisp"}', 'new', now() - interval '1 day'
  ),
  (
    'd0000000-0000-0000-0000-000000000402',
    'd0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000003',
    null,
    82.00, 55.00, 28.00, 50.00, 50.00, 54.35,
    'Iced Matcha', 6.00, null,
    null, null,
    'Matcha is moving, but nothing on your board is close. You sell iced coffee. Do not add this until you decide it is worth a new SKU.',
    '{"matcha powder","oat milk"}', 'new', now() - interval '1 day'
  );

insert into opportunity_evidence (opportunity_id, evidence_type, source, value, display_value, description)
values
  ('d0000000-0000-0000-0000-000000000401', 'menu_similarity',    'Keyword Match',        0.9100, '0.91',      'Strong match with your Chili Oil Noodles'),
  ('d0000000-0000-0000-0000-000000000401', 'ingredient_overlap', 'Restaurant Inventory', 0.7000, 'almost out','Chili oil is at 0.4 lb — restock before a special'),
  ('d0000000-0000-0000-0000-000000000402', 'menu_similarity',    'Keyword Match',        0.2800, '0.28',      'Weak match: iced coffee is not matcha');

insert into opportunity_evidence (opportunity_id, evidence_type, source, value, display_value, description)
values
  -- The five inputs behind 85.55. This list is the difference between a product
  -- and a black box.
  ('a0000000-0000-0000-0000-000000000401', 'trend_growth',       'Google Trends',        0.4300, '+43%',     'Search interest up 43% in Houston over 30 days'),
  ('a0000000-0000-0000-0000-000000000401', 'menu_similarity',    'Keyword Match',        0.9400, '0.94',     'Strong match with your Crispy Chicken Sandwich'),
  ('a0000000-0000-0000-0000-000000000401', 'ingredient_overlap', 'Restaurant Inventory', 0.8000, '4 of 5',   'You already stock chicken, bun, honey, and pickles'),
  ('a0000000-0000-0000-0000-000000000401', 'margin_impact',      'Economics Engine',     1.3700, '+$1.37',   'Higher contribution per order than the current version'),
  ('a0000000-0000-0000-0000-000000000401', 'sales_baseline',     'Sales History',       42.0000, '42/week',  'You sell about 42 of these per week'),

  ('a0000000-0000-0000-0000-000000000402', 'trend_growth',       'Google Trends',        0.2200, '+22%',     'National search interest up 22% over 30 days'),
  ('a0000000-0000-0000-0000-000000000402', 'menu_similarity',    'Keyword Match',        0.6100, '0.61',     'Partial match with your Buffalo Wings'),
  ('a0000000-0000-0000-0000-000000000402', 'margin_impact',      'Economics Engine',     1.2500, '+$1.25',   'Adds $0.25 cost against a $1.50 price increase'),

  ('a0000000-0000-0000-0000-000000000403', 'trend_growth',       'TikTok',               0.6800, '+68%',     'Matcha drink posts up 68% in 30 days'),
  ('a0000000-0000-0000-0000-000000000403', 'ingredient_overlap', 'Restaurant Inventory', 1.0000, '2 of 2',   'Matcha powder and oat milk are already on the shelf'),
  ('a0000000-0000-0000-0000-000000000403', 'sales_baseline',     'Sales History',       20.0000, '20/day',   'Matcha Latte already averages about 20 units a day'),

  ('a0000000-0000-0000-0000-000000000404', 'local_relevance',    'Local Events',         1.0000, 'Houston',  'Houston Burger Week begins 2026-09-21 across 42 venues'),
  ('a0000000-0000-0000-0000-000000000404', 'menu_similarity',    'Keyword Match',        0.7900, '0.79',     'Close match with your Classic Cheeseburger'),
  ('a0000000-0000-0000-0000-000000000404', 'ingredient_overlap', 'Restaurant Inventory', 1.0000, '3 of 3',   'No new inventory required'),

  ('a0000000-0000-0000-0000-000000000405', 'trend_growth',       'Google Trends',       -0.0400, '-4%',      'Search interest down 4% but still above baseline'),
  ('a0000000-0000-0000-0000-000000000405', 'menu_similarity',    'Keyword Match',        0.3200, '0.32',     'Weak match: nothing on the menu is close to birria');

-- ===========================================================================
-- 11. Layer 5 — activation
-- ===========================================================================
insert into campaigns (id, restaurant_id, opportunity_id, name, offer, start_date, end_date, status, created_at)
values (
  'a0000000-0000-0000-0000-000000000501',
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000404',
  'Double Smash Weekend',
  'Double Smash Burger, $14 — through Burger Week only',
  (current_date - interval '7 days')::timestamptz,
  (current_date + interval '7 days')::timestamptz,
  'live',
  now() - interval '9 days'
);

-- Two Instagram variants plus an SMS variant. Per-channel rows, not one blob of
-- copy: the SMS length limit alone makes a shared content column unusable.
insert into campaign_assets (campaign_id, channel, variant_label, headline, body, call_to_action, generated_by, prompt_used)
values
  (
    'a0000000-0000-0000-0000-000000000501', 'instagram', 'a',
    'Thin. Crispy. Doubled.',
    'Two smashed patties, cheddar melted into the edges, griddled onion. Burger Week only.',
    'Order ahead',
    'llm:gpt-4o-mini',
    'Write an Instagram caption for a limited-run double smash burger at a Houston counter-service restaurant. Under 200 characters, no hashtags in the body.'
  ),
  (
    'a0000000-0000-0000-0000-000000000501', 'instagram', 'b',
    'Burger Week starts here',
    'We smashed our quarter-pounder thin, doubled it, and left the crispy edges on. $14 while it lasts.',
    'See the menu',
    'llm:gpt-4o-mini',
    'Write an Instagram caption for a limited-run double smash burger at a Houston counter-service restaurant. Under 200 characters, no hashtags in the body.'
  ),
  (
    'a0000000-0000-0000-0000-000000000501', 'sms', 'a',
    null,
    'Ember & Rye: Double Smash Burger is on for Burger Week. $14, through Sunday. Reply STOP to opt out.',
    'Order now',
    'llm:gpt-4o-mini',
    'Write a 160-character SMS promoting a limited-run double smash burger. Include an opt-out.'
  );

insert into experiments (
  id, campaign_id, restaurant_id,
  baseline_start, baseline_end, experiment_start, experiment_end,
  target_metric, status, created_at
) values (
  'a0000000-0000-0000-0000-000000000601',
  'a0000000-0000-0000-0000-000000000501',
  'a0000000-0000-0000-0000-000000000001',
  (current_date - interval '35 days')::timestamptz,
  (current_date - interval '7 days')::timestamptz,
  (current_date - interval '7 days')::timestamptz,
  (current_date)::timestamptz,
  'revenue', 'measuring',
  now() - interval '9 days'
);

-- Append-only: re-measuring adds a row. roi is a decimal fraction, so 1.6459 is
-- 165% and the frontend does the x100.
insert into experiment_results (
  experiment_id, baseline_value, actual_value,
  estimated_incremental_revenue, estimated_incremental_cost, estimated_incremental_profit,
  roi, confidence_score, recommendation, computed_at
) values (
  'a0000000-0000-0000-0000-000000000601',
  4180.00, 5122.50,
  942.50, 356.20, 586.30,
  1.6460, 46.00,
  'Up 22.5% against a day-of-week matched baseline. Only 4 observations per weekday, so treat the interval as wide; keep the item and re-measure after another two weeks.',
  now() - interval '2 hours'
);

-- ===========================================================================
-- Done
-- ===========================================================================
analyze;
