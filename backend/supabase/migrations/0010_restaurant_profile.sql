-- Restaurant identity. City is too coarse for Austin or NYC: East Austin and
-- the Domain are different markets, and two restaurants in the same
-- neighborhood still need different trends if one is a taco stand and the
-- other is a tasting room. These columns are scoring inputs. pairKitchen
-- reads them; an empty profile produces a generic national ranking.

alter table restaurants
  add column if not exists neighborhood text,
  add column if not exists pride_in text,
  add column if not exists price_band text
    check (price_band is null or price_band in ('value', 'mid', 'upscale', 'fine')),
  add column if not exists service_occasions text[] not null default '{}',
  add column if not exists never_serve text,
  add column if not exists profile_completed_at timestamptz;

comment on column restaurants.neighborhood is
  'Finer than city. Williamsburg vs Midtown, East Austin vs the Domain. Used in local YouTube queries and local_relevance.';
comment on column restaurants.pride_in is
  'What the kitchen says it is good at, in their words. The main identity signal that keeps two nearby restaurants from receiving the same ranked list.';
comment on column restaurants.price_band is
  'value | mid | upscale | fine. A $9 counter and a $78 tasting menu should not share a shortlist.';
comment on column restaurants.service_occasions is
  'lunch, dinner, late_night, brunch. Filters dishes whose audience is a different daypart.';
comment on column restaurants.never_serve is
  'Hard nos (pork, tasting menus, raw seafood). A match here is a near-zero identity score, not a soft penalty.';
comment on column restaurants.profile_completed_at is
  'Set when the owner finishes the intake. Null means the app stays on the diagnostic; the restaurant row is not optional decoration.';
