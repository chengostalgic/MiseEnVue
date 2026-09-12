-- 0002_tenancy.sql
-- schema.md §2 — Layer 1, tenancy.
--
-- Single-owner for the MVP: one auth user owns a restaurant, no teams or roles.
-- Multi-user is a documented migration (extensibility.md#multi-user-restaurants)
-- that redefines public.owns_restaurant() and nothing else.

create table restaurants (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,

  name          text not null check (length(trim(name)) > 0),
  description   text,
  cuisine_type  text,
  city          text,
  state         text,
  timezone      text not null default 'America/Chicago',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index restaurants_owner_idx on restaurants (owner_id);

create trigger restaurants_touch
  before update on restaurants
  for each row execute function public.touch_updated_at();

comment on column restaurants.timezone is
  'IANA name. The only correct way to bucket sales into local days; every baseline depends on it.';
comment on column restaurants.city is
  'Scoring input, not profile decoration: drives local_relevance.';
