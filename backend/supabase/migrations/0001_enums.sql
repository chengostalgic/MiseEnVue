-- 0001_enums.sql
-- schema.md §0 (prerequisites) and §1 (enums).
--
-- Fixed value sets are real types, not text, so Postgres rejects a typo at
-- insert time instead of letting 'Instagram' and 'instagram' both in.

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- Shared updated_at trigger, used only by tables users edit directly.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- layer 2: restaurant state
create type sales_channel      as enum ('in_store', 'online', 'doordash', 'ubereats', 'other');
create type upload_kind        as enum ('menu', 'sales', 'inventory');
create type upload_status      as enum ('pending', 'processing', 'succeeded', 'partial', 'failed');

-- layer 3: external world
create type signal_source      as enum ('google_trends', 'reddit', 'tiktok', 'instagram', 'local_events', 'news', 'manual');
create type trend_category     as enum ('food', 'drink', 'ingredient', 'technique', 'social', 'seasonal', 'event', 'local_event');
create type trend_status       as enum ('active', 'fading', 'archived');
create type run_status         as enum ('running', 'succeeded', 'failed');

-- layer 4: decision
create type opportunity_status as enum ('new', 'viewed', 'accepted', 'rejected', 'testing', 'completed');
create type evidence_type      as enum ('trend_growth', 'menu_similarity', 'ingredient_overlap', 'local_relevance', 'margin_impact', 'sales_baseline');

-- layer 5: activation
create type campaign_channel   as enum ('instagram', 'tiktok', 'sms', 'email', 'in_store');
create type campaign_status    as enum ('draft', 'scheduled', 'live', 'paused', 'completed', 'cancelled');
create type experiment_status  as enum ('planned', 'running', 'measuring', 'completed', 'abandoned');
create type target_metric      as enum ('revenue', 'orders', 'menu_item_sales', 'contribution_profit', 'customer_count');
