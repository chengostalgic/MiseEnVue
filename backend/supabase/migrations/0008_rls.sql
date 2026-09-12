-- 0008_rls.sql
-- schema.md §8 — row level security.
--
-- RLS is enabled on EVERY table. A table with RLS off is readable by anyone
-- holding the anon key. Three access classes, and getting them wrong is the one
-- mistake in this project that leaks another restaurant's data.

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table restaurants           enable row level security;
alter table menu_items            enable row level security;
alter table ingredients           enable row level security;
alter table menu_item_ingredients enable row level security;
alter table inventory_counts      enable row level security;
alter table sales                 enable row level security;
alter table uploads               enable row level security;
alter table ingest_runs           enable row level security;
alter table raw_signals           enable row level security;
alter table trends                enable row level security;
alter table trend_signals         enable row level security;
alter table opportunities         enable row level security;
alter table opportunity_evidence  enable row level security;
alter table campaigns             enable row level security;
alter table campaign_assets       enable row level security;
alter table experiments           enable row level security;
alter table experiment_results    enable row level security;

-- ---------------------------------------------------------------------------
-- Ownership helper
-- ---------------------------------------------------------------------------
-- security invoker is correct here, not definer: the inner query is itself
-- subject to the restaurants policy, which is exactly the predicate we want,
-- and there is no recursion because the restaurants policies do not call this.
-- stable lets Postgres call it once per query rather than once per row, which
-- is also what keeps auth.uid() from being re-evaluated across a large scan.
--
-- Every tenant policy below calls this instead of inlining owner_id = auth.uid().
-- That indirection is the entire reason multi-user teams cost one function
-- change instead of a fifteen-policy rewrite with fifteen chances to leak.
create or replace function public.owns_restaurant(rid uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from restaurants r
    where r.id = rid and r.owner_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Class 1 — tenant-scoped
-- ---------------------------------------------------------------------------
-- Both clauses are required on every policy. `using` filters what you can read,
-- update, and delete; `with check` validates what you insert or update into.
-- A policy with only `using` lets a user insert rows onto someone else's
-- restaurant.

create policy restaurants_owner_all on restaurants
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy menu_items_tenant on menu_items
  for all to authenticated
  using (public.owns_restaurant(restaurant_id))
  with check (public.owns_restaurant(restaurant_id));

create policy ingredients_tenant on ingredients
  for all to authenticated
  using (public.owns_restaurant(restaurant_id))
  with check (public.owns_restaurant(restaurant_id));

create policy inventory_counts_tenant on inventory_counts
  for all to authenticated
  using (public.owns_restaurant(restaurant_id))
  with check (public.owns_restaurant(restaurant_id));

create policy sales_tenant on sales
  for all to authenticated
  using (public.owns_restaurant(restaurant_id))
  with check (public.owns_restaurant(restaurant_id));

create policy uploads_tenant on uploads
  for all to authenticated
  using (public.owns_restaurant(restaurant_id))
  with check (public.owns_restaurant(restaurant_id));

create policy opportunities_tenant on opportunities
  for all to authenticated
  using (public.owns_restaurant(restaurant_id))
  with check (public.owns_restaurant(restaurant_id));

create policy campaigns_tenant on campaigns
  for all to authenticated
  using (public.owns_restaurant(restaurant_id))
  with check (public.owns_restaurant(restaurant_id));

create policy experiments_tenant on experiments
  for all to authenticated
  using (public.owns_restaurant(restaurant_id))
  with check (public.owns_restaurant(restaurant_id));

-- Grandchildren have no restaurant_id, so they reach ownership through a parent.

create policy mii_tenant on menu_item_ingredients
  for all to authenticated
  using (exists (
    select 1 from menu_items mi
    where mi.id = menu_item_id and public.owns_restaurant(mi.restaurant_id)
  ))
  with check (exists (
    select 1 from menu_items mi
    where mi.id = menu_item_id and public.owns_restaurant(mi.restaurant_id)
  ));

create policy opportunity_evidence_tenant on opportunity_evidence
  for all to authenticated
  using (exists (
    select 1 from opportunities o
    where o.id = opportunity_id and public.owns_restaurant(o.restaurant_id)
  ))
  with check (exists (
    select 1 from opportunities o
    where o.id = opportunity_id and public.owns_restaurant(o.restaurant_id)
  ));

create policy campaign_assets_tenant on campaign_assets
  for all to authenticated
  using (exists (
    select 1 from campaigns c
    where c.id = campaign_id and public.owns_restaurant(c.restaurant_id)
  ))
  with check (exists (
    select 1 from campaigns c
    where c.id = campaign_id and public.owns_restaurant(c.restaurant_id)
  ));

create policy experiment_results_tenant on experiment_results
  for all to authenticated
  using (exists (
    select 1 from experiments e
    where e.id = experiment_id and public.owns_restaurant(e.restaurant_id)
  ))
  with check (exists (
    select 1 from experiments e
    where e.id = experiment_id and public.owns_restaurant(e.restaurant_id)
  ));

-- ---------------------------------------------------------------------------
-- Class 2 — shared read-only
-- ---------------------------------------------------------------------------
-- Trends are market data, shared by every restaurant on the platform. There is
-- deliberately no insert, update, or delete policy: only the service role writes
-- here, and the absence of a policy is what enforces that.

create policy trends_read on trends
  for select to authenticated
  using (true);

create policy trend_signals_read on trend_signals
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Class 3 — internal
-- ---------------------------------------------------------------------------
-- raw_signals and ingest_runs: RLS enabled, zero policies. Not an omission --
-- the strictest possible setting. Users have no business reading raw scraped
-- payloads or job telemetry, and the service role bypasses RLS entirely.

-- ---------------------------------------------------------------------------
-- RLS-friendly index
-- ---------------------------------------------------------------------------
-- owns_restaurant() runs (restaurants.id, owner_id) on every tenant query.
-- The primary key covers id; this covers the owner side of the lookup.
create index if not exists restaurants_id_owner_idx on restaurants (id, owner_id);

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
-- One private bucket, path convention {restaurant_id}/{kind}/{unix_ms}-{filename}.
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;

-- The uuid-shape guard is not in schema.md's DDL but is required in practice:
-- without it, an object whose first path segment is not a uuid raises a cast
-- error inside policy evaluation instead of simply being denied.
create policy uploads_bucket_tenant on storage.objects
  for all to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and public.owns_restaurant(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and public.owns_restaurant(((storage.foldername(name))[1])::uuid)
  );
