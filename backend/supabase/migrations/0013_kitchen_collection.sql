-- Tenant-owned shelf of things this kitchen collected: viral dishes,
-- YouTube evidence, marketing lessons. Owners can read them and delete them.

create table kitchen_collection (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  kind           text not null check (kind in ('dish', 'video', 'lesson', 'hidden')),
  title          text not null,
  summary        text,
  source         text,
  source_url     text,
  source_id      text,
  creativity     text,
  payload        jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  constraint kitchen_collection_unique unique (restaurant_id, kind, source_id)
);

create index kitchen_collection_kitchen_idx
  on kitchen_collection (restaurant_id, created_at desc);

comment on table kitchen_collection is
  'What this kitchen chose to keep — or hide — from Discover. Not market-global.';

alter table kitchen_collection enable row level security;

create policy kitchen_collection_tenant on kitchen_collection
  for all to authenticated
  using (public.owns_restaurant(restaurant_id))
  with check (public.owns_restaurant(restaurant_id));
