# The Database, Built

What exists now, how to run it, and how to prove it works.

This is the first item on the build order in [`backend-prompt.md`](./backend-prompt.md): the eight migrations, the seed dataset, and the tests. No Edge Functions yet — but because PostgREST plus RLS already gives an authorized read/write API over every table, the backend is testable and usable from a frontend today.

Verified against Postgres 17 with Supabase CLI 2.117.0. `supabase db reset` applies clean and `supabase test db` reports **81 passing assertions**.

---

## What was built

```text
backend/supabase/
├── config.toml                      (already existed, unchanged)
├── migrations/
│   ├── 0001_enums.sql               pgcrypto, touch_updated_at(), 13 enum types
│   ├── 0002_tenancy.sql             restaurants
│   ├── 0003_restaurant_state.sql    uploads, menu_items, ingredients,
│   │                                menu_item_ingredients, inventory_counts, sales
│   ├── 0004_external_signals.sql    ingest_runs, raw_signals, trends, trend_signals
│   ├── 0005_opportunities.sql       opportunities, opportunity_evidence
│   ├── 0006_activation.sql          campaigns, campaign_assets, experiments,
│   │                                experiment_results
│   ├── 0007_views.sql               current_inventory, menu_item_daily_sales,
│   │                                menu_item_baselines
│   └── 0008_rls.sql                 RLS on all 17 tables, owns_restaurant(),
│                                    15 policies, uploads bucket + storage policy
├── seed.sql                         the demo dataset
└── tests/
    ├── 00_schema.test.sql           23 structural invariants
    ├── 01_constraints.test.sql      17 rejected-bad-state assertions
    ├── 02_views.test.sql            12 view-correctness assertions
    ├── 03_rls.test.sql              20 tenant-isolation assertions
    └── 04_scoring.test.sql           9 score-integrity assertions
```

17 tables, 3 views, 13 enums, 1 helper function, 15 table policies plus 1 storage policy — exactly the shape [`schema.md`](./schema.md) specifies.

---

## Three implementation decisions not spelled out in `schema.md`

Everything else follows the DDL in `schema.md` literally. These three needed a call:

**1. `uploads` is created first inside `0003`.** `inventory_counts.upload_id` and `sales.upload_id` both reference it, so it has to exist before either. `schema.md` flags this in an ordering note; this is where it lands.

**2. Every view is declared `with (security_invoker = on)`.** This one is not cosmetic. A Postgres view runs with its *owner's* privileges by default, and migrations create these views as `postgres`. Without `security_invoker`, all three views would read straight past the RLS policies in `0008` and hand one restaurant's sales to another — a silent cross-tenant leak through the exact objects the dashboard reads most. `00_schema.test.sql` asserts no view can regress on this, and `03_rls.test.sql` asserts the filtering actually happens.

**3. The storage policy has a UUID-shape guard.** `schema.md` writes the predicate as:

```sql
public.owns_restaurant(((storage.foldername(name))[1])::uuid)
```

If an object's first path segment is not a UUID, that cast raises inside policy evaluation instead of simply denying access. A regex guard runs first, so a malformed path is a clean denial rather than a 500.

---

## The demo dataset

Two tenants. The second one exists so tenant isolation is testable — asserting against an empty other side proves nothing.

| | Ember & Rye | Sunrise Taqueria |
|---|---|---|
| Email | `owner@miseenvue.test` | `owner2@miseenvue.test` |
| Password | `password123` | `password123` |
| Restaurant ID | `a0000000-0000-0000-0000-000000000001` | `b0000000-0000-0000-0000-000000000001` |
| City | Houston, TX | Austin, TX |
| Role | the full demo | RLS fixture only |

What is in it:

| Table | Rows | Notes |
|---|---|---|
| `restaurants` | 2 | |
| `menu_items` | 15 | 12 for Ember & Rye, priced with real costs |
| `ingredients` | 22 | 20 for Ember & Rye |
| `menu_item_ingredients` | 33 | wires dishes to ingredients, drives `operational_fit` |
| `inventory_counts` | 21 | includes one superseded count, so `current_inventory` has something to collapse |
| `sales` | 2253 | **90 distinct local days**, two dayparts, weekday/weekend variation |
| `uploads` | 5 | three clean, one `partial` with structured `errors` |
| `ingest_runs` | 5 | four succeeded, one failed with an error message |
| `raw_signals` | 17 | **3 left unprocessed**, so the backlog queue is non-empty |
| `trends` | 5 | four active, one fading with negative velocity |
| `trend_signals` | 14 | 2–4 sources per trend |
| `opportunities` | 6 | 5 for Ember & Rye, one with a null `menu_item_id` |
| `opportunity_evidence` | 16 | five rows behind the flagship 85.55 |
| `campaigns` / `campaign_assets` | 1 / 3 | two Instagram variants plus SMS |
| `experiments` / `experiment_results` | 1 / 1 | non-overlapping windows, ROI as a fraction |

Five details in there are load-bearing rather than decorative:

**Sales quantities are deterministic**, derived from `md5(item, date, daypart)` instead of `random()`. Two resets produce byte-identical numbers, so a failing test means a real regression rather than an unlucky draw.

**Weekday variation is real.** Friday and Saturday factors are 1.38 and 1.45 against Monday's 0.82. Without that spread, `menu_item_baselines` is untestable — and the day-of-week baseline is what the entire experiment layer rests on.

**One sale is at 23:40 local on a Friday.** In UTC that is Saturday. It is the row that proves `menu_item_daily_sales` buckets by the restaurant's timezone, and `02_views.test.sql` first asserts the two dates genuinely differ so the check cannot pass vacuously.

**`chili flakes` is deliberately absent from the ingredient catalog.** That single gap is what makes the hot-honey opportunity score `operational_fit = 80` with exactly one nameable missing item — the difference between a number and something a chef can act on this afternoon.

**Every `overall_score` satisfies the weighted formula exactly.** `0.25·trend + 0.15·local + 0.20·menu_fit + 0.15·operational + 0.25·profitability`, and `04_scoring.test.sql` recomputes all six rows. A mistyped weight produces a score that is wrong but still inside 0–100, so every check constraint would happily pass — asserting the relationship is the only way to catch it.

Two things the seed does **not** invent: opportunities with no matching menu item report `null` financials rather than a projection, and the two unresolved rows from the partial upload land with a null `menu_item_id` so revenue stays correct while the link stays honestly missing.

> The layer 4 and 5 rows will be written by `job-generate-opportunities` once it exists. They are seeded now so the feed, the evidence panel, and the campaign flow can be built against real data.

---

## Running it locally

Requires Docker running.

```bash
cd backend

supabase start          # Postgres + Auth + Storage + Studio + PostgREST
supabase db reset       # apply 0001-0008, then seed.sql
supabase test db        # run the pgTAP suite
```

`db reset` takes about 35 seconds and prints each migration as it applies. Expected tail:

```text
Applying migration 0008_rls.sql...
Seeding data from supabase/seed.sql...
Finished supabase db reset
```

Local endpoints:

| | |
|---|---|
| Studio (browse the data) | http://127.0.0.1:54323 |
| REST | http://127.0.0.1:54321/rest/v1 |
| Auth | http://127.0.0.1:54321/auth/v1 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Mailpit | http://127.0.0.1:54324 |

Get the local keys any time with `supabase status`. They are fixed demo keys, safe to commit to a local `.env`, and worthless outside your machine.

No `psql` installed? Use the one inside the container:

```bash
docker exec -it supabase_db_backend psql -U postgres -d postgres
```

---

## Pushing to your hosted project

The migrations are environment-independent. The seed is not, and you probably do not want fake sales in a real project — so decide deliberately.

```bash
cd backend

supabase login
supabase link --project-ref <your-project-ref>   # prompts for the DB password
supabase db push                                  # applies 0001-0008 only
```

Confirm the server version matches `config.toml`'s `major_version = 17` first. On the hosted project run `show server_version;` in the SQL editor; if it is 15 or 16, change `major_version` to match before linking, otherwise local and remote drift.

Two notes on `db push`:

- It runs **migrations only**. `seed.sql` is local-only by default (`[db.seed] sql_paths` in `config.toml`).
- `0008` creates the `uploads` storage bucket and a policy on `storage.objects`. Both are supported from a migration on hosted projects, but if the bucket already exists the insert is a no-op by design.

If you *do* want the demo data in the hosted project — reasonable for a staging project you are demoing from — `seed.sql` is written to handle it. It deletes its own rows by fixed UUID before inserting, so it is safe to run repeatedly, and it resolves the demo users by email rather than assuming them, so it also works if you created those users through the dashboard first. Paste it into the SQL editor, or:

```bash
supabase db reset --linked      # DESTRUCTIVE: rebuilds the remote database, then seeds
```

Only use `--linked` on a project you are willing to lose.

---

## Testing it

### The test suite

```bash
supabase test db
```

```text
00_schema.test.sql ....... ok
01_constraints.test.sql .. ok
02_views.test.sql ........ ok
03_rls.test.sql .......... ok
04_scoring.test.sql ...... ok
All tests successful.
Files=5, Tests=81
Result: PASS
```

Each file is a pgTAP transaction that rolls back, so the suite never mutates the seeded data and can be run repeatedly.

What each one is actually defending:

| File | Defends against |
|---|---|
| `00_schema` | a later migration adding a bare `timestamp`, a `float` money column, a view without `security_invoker`, a `restaurant_id` on a layer-3 table, or a table with RLS off |
| `01_constraints` | negative prices, scores over 100, a duplicated CSV import, a case-variant menu item, an experiment whose baseline overlaps its own measurement window |
| `02_views` | UTC day bucketing, `current_inventory` returning a stale count, a baseline built on too few observations, units lost in the grouping |
| `03_rls` | every form of cross-tenant read and write, anon access, writes to shared tables, any visibility of internal tables |
| `04_scoring` | a mistyped weight, a 0–1 value leaking into a 0–100 column, an opportunity that invents financials it has no baseline for, a score with no evidence behind it |

Two things `03_rls` does that are easy to get wrong. It runs as a real `authenticated` role with a real JWT claim, because `postgres` bypasses RLS and would pass everything. And it checks a cross-tenant `update` by asserting **tenant B's data did not change**, not that the statement failed — RLS filters the rows away, so the statement succeeds while affecting nothing.

### The path the frontend will use

Sign in, then read through PostgREST. This exercises Auth, PostgREST, and RLS together:

```bash
ANON=$(supabase status -o env | grep ANON_KEY | cut -d= -f2- | tr -d '"')

TOKEN=$(curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"owner@miseenvue.test","password":"password123"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# the primary product query
curl -s "http://127.0.0.1:54321/rest/v1/opportunities?select=overall_score,suggested_name,status,missing_ingredients&order=overall_score.desc" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

```json
[
  { "overall_score": 85.55, "suggested_name": "Hot Honey Crispy Chicken Sandwich",
    "status": "new", "missing_ingredients": ["chili flakes"] },
  { "overall_score": 81.1,  "suggested_name": "Iced Matcha Cream Latte",
    "status": "viewed", "missing_ingredients": [] },
  { "overall_score": 78.8,  "suggested_name": "Double Smash Burger",
    "status": "accepted", "missing_ingredients": [] },
  { "overall_score": 69.7,  "suggested_name": "Chili Crisp Wings",
    "status": "new", "missing_ingredients": ["chili crisp"] },
  { "overall_score": 61.9,  "suggested_name": "Birria Grilled Cheese",
    "status": "new", "missing_ingredients": ["beef chuck", "dried chiles", "oaxaca cheese"] }
]
```

Five rows, not six — the sixth belongs to Sunrise Taqueria and the policy removed it without being asked to.

Verified row visibility for that JWT:

| Endpoint | Rows visible | Why |
|---|---|---|
| `restaurants` | 1 | own only |
| `menu_items` | 12 | own only, of 15 total |
| `sales` | 2163 | own only |
| `trends` | 5 | shared read-only |
| `raw_signals` | 0 | internal: RLS on, zero policies |
| `ingest_runs` | 0 | internal |
| `current_inventory` | 19 | view, filtered by RLS |
| `menu_item_baselines` | 84 | 12 items × 7 weekdays |

And with no JWT at all, `curl` with only the anon key returns `[]` from every table.

### Useful things to look at in Studio

```sql
-- the evidence behind the flagship score
select evidence_type, source, display_value, description
from opportunity_evidence
where opportunity_id = 'a0000000-0000-0000-0000-000000000401';

-- day-of-week baseline for the best seller: Friday and Saturday should stand out
select day_of_week, round(avg_units, 1) as avg_units, observed_days
from menu_item_baselines
where menu_item_id = 'a0000000-0000-0000-0000-000000000201'
order by day_of_week;

-- the ingestion backlog, which is what the normalize stage will consume
select source, source_id, query from raw_signals where processed_at is null;

-- adapter health: new_count tracking fetched_count on every run means
-- source_id is unstable and trend scores are inflating
select source, status, fetched_count, new_count, error from ingest_runs order by started_at desc;

-- the partial upload, and exactly which rows failed
select kind, status, row_count, error_count, errors from uploads where status = 'partial';
```

---

## What is not built yet

Next on the build order in [`backend-prompt.md`](./backend-prompt.md):

- [ ] `_shared/`: `clients.ts`, `http.ts`, `auth.ts`, `csv.ts`, and generated `db.types.ts`
- [ ] `_shared/domain/`: `matching.ts`, `scoring.ts`, `economics.ts`, with unit tests including the assertion that the weights sum to 1.0
- [ ] `uploads/` — signed URL, record, process, all three CSV kinds
- [ ] `job-ingest-trends/` — `manual` and seeded adapters
- [ ] `job-generate-opportunities/` — write opportunities plus evidence
- [ ] `opportunities/` — accept, reject
- [ ] `campaigns/` — create from opportunity, generate per-channel assets via LLM
- [ ] `experiments/` — create from campaign, measure against baseline

The database is ready for all of them. Two things to do first when you start:

```bash
supabase gen types typescript --local > supabase/functions/_shared/db.types.ts
```

and port the weighted formula from `04_scoring.test.sql` into `_shared/domain/scoring.ts` as the single exported constants object, so the SQL test and the TypeScript implementation cannot disagree about the weights.

Schema changes from here are always a new numbered migration. Never edit `0001`–`0008` — `supabase db reset` is cheap locally, and hand-editing applied history breaks the moment someone else pulls.
