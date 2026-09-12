# Backend Architecture

Companion docs: [`schema.md`](./schema.md) for the database, [`extensibility.md`](./extensibility.md) for how to grow past the MVP.

## 1. What this backend is for

The backend answers exactly one question, repeatedly:

> Is this specific trend worth acting on for this specific restaurant right now?

Everything else exists to produce, justify, or evaluate that answer. If a proposed table or endpoint does not help answer or measure that question, it does not belong in the MVP.

The unit of value is the **opportunity**: a scored, priced, explained pairing of one external trend with one restaurant's menu item. A trend alone is not a product. A menu item alone is not a product. The opportunity is.

## 2. The five layers

The data model is not a flat list of tables. It is five layers, each answering a different question. Read them in this order.

| Layer | Question | Tables |
|---|---|---|
| 1. Tenancy | Who is allowed to see what? | `restaurants` |
| 2. Restaurant state | What do we know about this business? | `menu_items`, `ingredients`, `menu_item_ingredients`, `inventory_counts`, `sales`, `uploads` |
| 3. External world | What do we know about the market? | `ingest_runs`, `raw_signals`, `trends`, `trend_signals` |
| 4. Decision | What do we think they should do, and why? | `opportunities`, `opportunity_evidence` |
| 5. Activation | What happened when they did it? | `campaigns`, `campaign_assets`, `experiments`, `experiment_results` |

Layers 1–3 are inputs. Layer 4 is the product. Layer 5 is the proof.

Two properties follow from this and should be preserved:

- **Layers 2 and 3 never reference each other.** Restaurant data knows nothing about trends; trend data knows nothing about restaurants. They only meet in layer 4. This is what lets you swap trend sources or POS integrations independently.
- **Layer 3 is global, layers 1, 2, 4, 5 are tenant-scoped.** `trends` is shared across every restaurant on the platform. Everything else belongs to exactly one restaurant. This distinction drives the entire security model (§7) and is the easiest thing to get catastrophically wrong.

## 3. Runtime

**Supabase only. Supabase Postgres, Supabase Auth, Supabase Storage, Supabase Edge Functions (Deno/TypeScript).**

There is no Python service, no separate API server, no queue, no cache. If you find yourself wanting one, read [`extensibility.md`](./extensibility.md#swapping-in-a-python-service) first — it is a documented escape hatch, not an MVP decision.

The most important consequence of choosing Supabase: **most reads do not need backend code at all.** PostgREST plus row-level security already gives the frontend a filtered, paginated, authorized read API over every table. Write an Edge Function only when a request needs something the database cannot do by itself.

| Access pattern | How to do it |
|---|---|
| Read a restaurant's menu, sales, opportunities, campaigns | `supabase-js` directly from the frontend, secured by RLS |
| Simple inserts and updates the user is authorized for | `supabase-js` directly, secured by RLS |
| Aggregations and baselines | Postgres views and RPC functions, called via `supabase-js` |
| Parse a CSV, match rows to menu items, insert in bulk | Edge Function |
| Score opportunities, run economics | Edge Function |
| Fetch and normalize external trend data | Edge Function, service role |
| Generate ad copy with an LLM | Edge Function (holds the API key) |

That table is the definition of "lightweight." The backend is small because the database is doing most of the work.

## 4. Repository layout

```text
backend/
├── backend-prompt.md            # index + build order + hard rules
├── architecture.md              # this file
├── schema.md                    # tables, enums, constraints, RLS
├── extensibility.md             # extension seams and their cost
└── supabase/
    ├── config.toml
    ├── seed.sql                 # one demo restaurant, menu, 90 days of sales, 5 trends
    ├── migrations/
    │   ├── 0001_enums.sql
    │   ├── 0002_tenancy.sql
    │   ├── 0003_restaurant_state.sql
    │   ├── 0004_external_signals.sql
    │   ├── 0005_opportunities.sql
    │   ├── 0006_activation.sql
    │   ├── 0007_views.sql
    │   └── 0008_rls.sql
    └── functions/
        ├── _shared/             # leading underscore = not deployed as a function
        │   ├── clients.ts       # anonClient(req) and serviceClient() factories
        │   ├── http.ts          # ok(), fail(), route(), CORS
        │   ├── auth.ts          # requireUser(), requireRestaurantAccess()
        │   ├── csv.ts           # header validation, row parsing, coercion
        │   ├── db.types.ts      # generated: supabase gen types typescript
        │   └── domain/          # pure functions, zero I/O, unit-testable
        │       ├── scoring.ts   # component scores + weighted overall
        │       ├── economics.ts # contribution, incremental revenue/profit, ROI
        │       └── matching.ts  # trend -> menu item candidate matching
        ├── uploads/index.ts             # sign, record, and process menu/sales/inventory CSVs
        ├── opportunities/index.ts       # accept, reject, re-score
        ├── campaigns/index.ts           # create from opportunity, generate assets, launch
        ├── experiments/index.ts         # create from campaign, measure
        ├── job-ingest-trends/index.ts   # service role, cron or manual
        └── job-generate-opportunities/index.ts
```

Two rules about this layout:

1. **`_shared/domain/` contains no I/O.** No database calls, no `fetch`, no environment variables. Every function in it takes plain data and returns plain data. This is what makes scoring and economics testable without a database, and it is the seam that lets you move that logic to another language later.
2. **Each Edge Function is a tiny router, not one endpoint.** Supabase routes `POST /functions/v1/uploads/anything` to `uploads/index.ts`, so a single function handles a related group of paths. Six functions, not thirty.

## 5. Conventions

Declare these once and never restate them per-table. An implementer or code generator that follows §5 will produce consistent migrations; one that does not will produce subtly broken ones.

### Types

| Concept | Type | Notes |
|---|---|---|
| Primary key | `uuid primary key default gen_random_uuid()` | Never bigserial; IDs appear in URLs |
| Any point in time | `timestamptz` | **Never** bare `timestamp` |
| Money | `numeric(10,2)` | Never `float`/`real` |
| Unit cost | `numeric(10,4)` | Cents-per-gram needs the extra digits |
| Quantity | `numeric(12,4)`, or `integer` for whole units sold |  |
| Score | `numeric(5,2)` with `check (x >= 0 and x <= 100)` | Always 0–100 |
| Rate / velocity / growth | `numeric(6,4)` | Decimal fraction: `0.43` means +43% |
| Similarity | `numeric(4,3)` with `check (x >= 0 and x <= 1)` | Always 0–1 |
| Fixed value set | A Postgres `enum` type | Never bare `text` with the values in a comment |
| Open-ended labels | `text[] not null default '{}'` | e.g. `menu_items.tags` |
| Provider payloads | `jsonb not null default '{}'` | Raw or unmodeled data only |

**The two scale conventions are load-bearing.** Anything named `*_score` is 0–100. Anything named `*_rate`, `*_velocity`, or `*_ratio` is a decimal fraction. Anything named `*_similarity` is 0–1. The weighted scoring formula sums score columns directly, so mixing a 0–1 value into it produces a wrong answer with no error — the single most likely silent bug in this system.

### Timezones

Every timestamp is stored in UTC as `timestamptz`. `restaurants.timezone` holds an IANA name (`America/Chicago`) and is the **only** correct way to bucket data by day. "How many sandwiches do we sell on a Friday?" is a question about the restaurant's local Friday, not UTC's. Any query that groups by day must convert:

```sql
(s.sold_at at time zone r.timezone)::date
```

### Naming

- Tables: `snake_case`, plural (`menu_items`).
- Foreign keys: `<singular_table>_id` (`menu_item_id`).
- Timestamps: `_at` suffix (`sold_at`, `created_at`, `processed_at`).
- Booleans: adjective, no `is_` prefix (`active`).
- Enum types: singular (`campaign_channel`), values `snake_case`.

### Defaults every table gets

`created_at timestamptz not null default now()`. Add `updated_at` only on tables the user edits (`restaurants`, `menu_items`, `opportunities`, `campaigns`), maintained by a shared trigger. Append-only tables (`sales`, `trend_signals`, `raw_signals`, `inventory_counts`, `experiment_results`) do not get one.

### Deletion behavior

Every foreign key declares one explicitly:

- `on delete cascade` when the child is meaningless without the parent (menu items under a restaurant, evidence under an opportunity).
- `on delete set null` when the child is a historical fact that outlives the parent (a `sales` row survives deleting a menu item; the sale still happened).

### API response shape

Success returns the resource, or a list envelope:

```json
{ "data": [ ... ], "page": { "limit": 25, "offset": 0, "total": 137 } }
```

Failure always returns HTTP 4xx/5xx with:

```json
{
  "error": {
    "code": "csv_missing_column",
    "message": "sales.csv is missing required column 'sold_at'",
    "details": { "missing": ["sold_at"], "found": ["menu_item", "quantity"] }
  }
}
```

`code` is a stable machine-readable string the frontend can branch on. `message` is human-readable and safe to display. `details` is optional and structured. Never return a raw Postgres error to the client — log it, return a code.

## 6. The pipeline

Six stages. Each one has a clear input, a clear output table, and a rule about whether an LLM may participate.

```text
   ┌─────────────────────┐        ┌──────────────────────┐
   │  RESTAURANT STATE   │        │   EXTERNAL WORLD     │
   │  menu, sales,       │        │  reddit, google,     │
   │  ingredients,       │        │  local events        │
   │  inventory          │        │                      │
   └──────────┬──────────┘        └──────────┬───────────┘
              │                              │
              │                    ① ingest → raw_signals
              │                              │
              │                    ② normalize → trends + trend_signals
              │                              │
              └──────────────┬───────────────┘
                             │
                   ③ match → candidate pairs
                             │
                   ④ score → component scores
                             │
                   ⑤ economics → price, cost, incremental profit
                             │
                             ▼
                   ⑥ opportunities + opportunity_evidence
                             │
                             ▼
                        campaigns
                             │
                             ▼
                       experiments
                             │
                             ▼
                    experiment_results
                    (did it actually work?)
```

### ① Ingest — `job-ingest-trends`

Fetch from one provider, write the untouched payload to `raw_signals` with a `(source, source_id)` unique key, record the run in `ingest_runs`. No interpretation, no scoring.

The unique key is the whole point: re-running a Reddit scrape must not duplicate posts, and when a trend score looks wrong you need the original payload to explain it. Conflicts are swallowed with `on conflict (source, source_id) do nothing`, so ingestion is safely re-runnable.

Each provider is an adapter with one signature (see [`extensibility.md`](./extensibility.md#adding-a-trend-source)). For the MVP, `manual` and seeded data are legitimate adapters — a demo does not require a live Reddit key.

### ② Normalize — `job-ingest-trends`

Turn unprocessed `raw_signals` into `trend_signals` attached to a `trends` row, then recompute `trends.trend_score` and `trends.trend_velocity` from the attached signals. Stamp `raw_signals.processed_at` so the work is not repeated.

This is the one stage where an LLM is genuinely useful: mapping "everyone's putting chili crisp on everything" to the canonical trend `chili-crisp` in category `ingredient` is fuzzy text work. The LLM proposes the trend name, slug, and category. It does **not** set the score.

### ③ Match — `_shared/domain/matching.ts`

For a trend and a restaurant, produce candidate `(trend, menu_item)` pairs with a similarity in 0–1. MVP implementation is keyword and tag overlap against `menu_items.name`, `description`, `category`, and `tags`. Keep only pairs above a floor (start at `0.30`) so you store a handful of real candidates instead of a cross join.

This is deliberately the crudest stage, and it is designed to be replaced. Swapping in `pgvector` embeddings later changes this file and nothing else.

### ④ Score — `_shared/domain/scoring.ts`

Five components, each 0–100, combined by fixed weights:

```text
overall_score =
    0.25 × trend_strength
  + 0.15 × local_relevance
  + 0.20 × menu_fit
  + 0.15 × operational_fit
  + 0.25 × profitability
```

| Component | MVP definition |
|---|---|
| `trend_strength` | `trends.trend_score` as-is |
| `local_relevance` | 100 if the trend's region matches the restaurant's city/state, else 60; scaled by the share of the trend's signals that came from local sources |
| `menu_fit` | best candidate similarity from stage ③, × 100 |
| `operational_fit` | fraction of the proposed dish's ingredients the restaurant already stocks, × 100; falls back to a neutral 60 when ingredient data is absent |
| `profitability` | proposed contribution margin normalized against the restaurant's existing menu margins |

Every weight and threshold in this stage lives in one exported constants object, not scattered as literals. `opportunities.scoring_version` records which version produced a row, so you can re-score without destroying history and compare old against new.

Rounding happens once, at the end, to two decimals. Do not round components before weighting.

### ⑤ Economics — `_shared/domain/economics.ts`

Plain arithmetic, no LLM, no exceptions:

```text
current_contribution  = menu_item.price - menu_item.estimated_cost
proposed_contribution = suggested_price - proposed_cost
contribution_delta    = proposed_contribution - current_contribution

baseline_units         = mean units/day for this item over the trailing 28 local days
expected_uplift        = uplift_factor(trend_score)      -- tunable constant, start 0.05–0.25
expected_units         = baseline_units × days × (1 + expected_uplift)

incremental_revenue = (expected_units × suggested_price) - (baseline_units × days × menu_item.price)
incremental_profit  = (expected_units × proposed_contribution) - (baseline_units × days × current_contribution)
roi                 = incremental_profit / max(incremental_cost, 1)
```

Every assumption is a named constant. When a restaurant has no sales history, `baseline_units` is null — return nulls for the financial fields rather than inventing a number, and let `profitability` fall back to margin-only.

### ⑥ Persist — `job-generate-opportunities`

Write the `opportunities` row with all five component scores plus the overall, and write one `opportunity_evidence` row per input that moved the number. The component scores and `estimated_cost` are **deliberately denormalized snapshots** of the values at scoring time — do not "fix" this into a live join. A recommendation shown to a user in September must still explain itself in October after the trend has faded and the menu price has changed.

Evidence is not decoration. It is the difference between a product and a black box:

```text
Why are we recommending this?
  · Google Trends search interest up 43% in Houston           (trend_growth)
  · Strong match with your Crispy Chicken Sandwich (0.94)     (menu_similarity)
  · You already stock 4 of 5 required ingredients             (ingredient_overlap)
  · +$1.37 contribution per order vs. the current version     (margin_impact)
```

## 7. Security model

Auth is Supabase Auth. Authorization is row-level security, enforced in the database, so it holds whether the request arrives through an Edge Function or straight from the browser.

**Ownership is single-owner for the MVP.** `restaurants.owner_id` references `auth.users(id)`. One user owns a restaurant; there are no teams, roles, or invitations. Every tenant-scoped policy reduces to one predicate, wrapped in a helper:

```sql
public.owns_restaurant(restaurant_id)   -- restaurants.owner_id = auth.uid()
```

Multi-user teams are a documented migration, not a hidden assumption. See [`extensibility.md`](./extensibility.md#multi-user-restaurants).

**The three access classes.** Getting these wrong is the one mistake in this document that leaks another restaurant's data:

| Class | Tables | Authenticated user can | Service role can |
|---|---|---|---|
| Tenant-scoped | `restaurants`, `menu_items`, `ingredients`, `menu_item_ingredients`, `inventory_counts`, `sales`, `uploads`, `opportunities`, `opportunity_evidence`, `campaigns`, `campaign_assets`, `experiments`, `experiment_results` | read/write only their own rows | everything |
| Shared read-only | `trends`, `trend_signals` | read all rows | write |
| Internal | `raw_signals`, `ingest_runs` | nothing | everything |

Shared read-only and internal tables have RLS enabled with **no write policies at all**. Absence of a policy is the enforcement.

**Key discipline.** The service role key bypasses RLS entirely, which makes it the sharpest object in the project:

- It lives only in Edge Function secrets. It never reaches the browser, a client bundle, or a committed file.
- Only `job-*` functions use it.
- User-facing functions build their client from the anon key plus the caller's forwarded `Authorization` header, so RLS applies to them exactly as it would to the frontend. A user-facing function that uses the service role has silently disabled authorization for that endpoint.

**Storage.** One private bucket, `uploads`, with the path convention `{restaurant_id}/{kind}/{unix_ms}-{filename}`. A policy on `storage.objects` restricts access to paths whose first segment is a restaurant the caller owns. Clients get a signed upload URL from the `uploads` function rather than write credentials.

## 8. CSV ingestion

The MVP takes restaurant data by file upload. Three kinds — `menu`, `sales`, `inventory` — sharing one pipeline and one `uploads` table.

```text
frontend requests a signed URL   →  POST /uploads/{restaurant_id}/{kind}
frontend PUTs the file to Storage
frontend triggers processing     →  POST /uploads/{upload_id}/process
                                        │
                                        ├─ validate headers   → 400 with the missing list
                                        ├─ parse and coerce rows
                                        ├─ resolve names to IDs
                                        ├─ bulk insert, collecting per-row errors
                                        └─ update uploads.status + counts + errors[]
frontend polls or re-reads       →  GET /uploads/{upload_id}
```

Recording every upload in a table is what makes a demo survivable. When a file half-imports, `uploads.status = 'partial'` with `error_count` and a structured `errors` array tells you which rows failed and why, instead of leaving you guessing at a silent failure on stage.

**Name resolution is the subtle part.** `sales.csv` and `inventory.csv` reference items by name, not UUID. The rule:

1. Match case-insensitively and whitespace-trimmed against existing rows for that restaurant.
2. `menu` uploads **upsert** — a matched name updates price and cost, an unmatched name creates an item.
3. `inventory` uploads create missing `ingredients` rows automatically, since an unknown ingredient name is still a real thing on a shelf.
4. `sales` uploads **never create menu items.** An unmatched name is a row-level error recorded in `uploads.errors`, and the sale is inserted with a null `menu_item_id` so revenue totals stay correct while the link stays honestly missing.

That asymmetry is intentional. Auto-creating menu items from a typo in a sales export silently corrupts the menu that every downstream score depends on.

Expected headers:

```csv
# menu.csv
name,description,category,price,estimated_cost

# sales.csv
menu_item,sold_at,quantity,revenue,channel

# inventory.csv
ingredient,unit,quantity_on_hand,unit_cost
```

Inventory uploads are append-only counts, not edits. Each row becomes an `inventory_counts` row stamped with `counted_at`, and the `current_inventory` view reads the latest count per ingredient. Nothing is ever overwritten, so there is no update logic to get wrong and you keep a free history of stock levels.

## 9. What an LLM may and may not do

The line is between fuzzy language work and arithmetic.

**Allowed:** naming and categorizing trends from messy text, explaining in prose why a trend fits a restaurant, generating ad copy and menu descriptions, suggesting promotion ideas, restating numbers a human already computed.

**Forbidden:** opportunity scores, component scores, similarity values, food cost, contribution margin, suggested price, incremental revenue, incremental profit, ROI, sales baselines, confidence, and anything else in stages ④ and ⑤.

Two reasons this is a hard rule, not a preference. Non-determinism: the same restaurant asking twice must not get two different ROI figures. Defensibility: the product's claim is "this will make you $341," and you cannot stand behind that number if a language model guessed it. An LLM may *narrate* a computed number; it may never *produce* one.

## 10. Local development

```bash
supabase start                      # local Postgres + Auth + Storage + Studio
supabase db reset                   # apply all migrations, then run seed.sql
supabase functions serve            # Edge Functions on localhost with hot reload
supabase gen types typescript --local > supabase/functions/_shared/db.types.ts
```

`seed.sql` must produce a demo that exercises the entire pipeline end to end: one restaurant, roughly a dozen menu items with real prices and costs, a handful of ingredients wired to those items, an inventory count, about 90 days of sales with believable weekday-versus-weekend variation, and five trends with signals from at least two sources. Without that weekday variation the baseline math is untestable, and the baseline is what the whole experiment layer rests on.

Schema changes are always a new numbered migration. Never edit an applied one — `supabase db reset` is cheap locally, and hand-editing history breaks the moment anyone else pulls.

## 11. MVP scope

Build, in this order:

- [ ] Enums, then the five table layers, then views, then RLS policies
- [ ] `seed.sql` producing a full working demo dataset
- [ ] `_shared` helpers: clients, http, auth, csv
- [ ] `_shared/domain/`: matching, scoring, economics, with unit tests
- [ ] `uploads` function handling all three CSV kinds
- [ ] `job-ingest-trends` with the `manual` and seeded adapters
- [ ] `job-generate-opportunities` writing opportunities and evidence
- [ ] `opportunities` function: accept, reject
- [ ] `campaigns` function: create from opportunity, generate assets via LLM
- [ ] `experiments` function: create from campaign, measure against baseline

Deliberately excluded — see [`extensibility.md`](./extensibility.md) for what each one costs later: live Reddit, Google Trends, and TikTok integrations; `pgvector` embedding search; scheduled cron; multi-user teams; POS integrations; statistical significance testing; ingredient-level recipe costing beyond simple overlap.

Never add, at any stage: MongoDB, Redis, Kafka, Kubernetes, microservices, event buses, or custom authentication. Postgres and Supabase are sufficient, and each of these would cost more to operate than the problem it solves.
