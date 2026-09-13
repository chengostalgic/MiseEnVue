# MiseEnVue Backend — Index

MiseEnVue turns external food trends into revenue for individual restaurants. It scrapes public signals (food media, Maps reviews, search), compares them against a restaurant's actual menu, sales history, and inventory, then recommends specific menu items to launch and generates the ads to promote them — and measures afterward whether the launch actually made money. Nearby demand is one factor. A working take from another city or country still counts if this kitchen can run it.

The backend exists to answer one question, repeatedly:

> Is this specific trend worth acting on for this specific restaurant right now?

The unit of value is the **opportunity**: a scored, priced, explained pairing of one trend with one menu item. A trend alone is not a product. A menu item alone is not a product.

## Documents

Read in this order.

| Document | Contents |
|---|---|
| [`architecture.md`](./architecture.md) | The five data layers, runtime choice, repo layout, naming and type conventions, the six pipeline stages with their formulas, the security model, CSV ingestion, and local dev |
| [`schema.md`](./schema.md) | Runnable DDL for 17 tables and 3 views, enums, constraints, indexes, and every RLS policy |
| [`extensibility.md`](./extensibility.md) | What each deferred feature costs to add later, with a summary table up front |

## Stack

Supabase and nothing else: Postgres, Auth, Storage, and Edge Functions (Deno/TypeScript). No Python service, no queue, no cache, no separate API server.

The reason this stays lightweight: **PostgREST plus row-level security already provides an authorized read/write API over every table.** Write an Edge Function only for work the database cannot do alone — CSV parsing, scoring, external fetches, LLM calls. Six functions total. See [`architecture.md` §3](./architecture.md#3-runtime).

## The pipeline

```text
restaurant state          external world
(menu, sales,             (reddit, google,
 ingredients, inventory)   local events)
        │                         │
        │              ① ingest    → raw_signals
        │              ② normalize → trends + trend_signals
        │                         │
        └────────────┬────────────┘
                     │
            ③ match  → candidate (trend, menu_item) pairs
            ④ score  → 5 components, weighted
            ⑤ economics → price, cost, incremental profit
                     ▼
            ⑥ opportunities + opportunity_evidence
                     ▼
                 campaigns → campaign_assets (the ads)
                     ▼
                experiments → experiment_results (did it work?)
```

## Ten rules

These are the constraints most likely to be violated by someone — human or model — implementing from these docs.

1. **An LLM never produces a number.** Scores, prices, costs, margins, revenue, profit, ROI, and baselines are all deterministic code in `_shared/domain/`. An LLM may name a trend, write ad copy, and narrate a computed number in prose. It may never compute one. Non-determinism and defensibility: you cannot tell an owner "this will make you $341" if a language model guessed it.
2. **`*_score` is 0–100. `*_rate`, `*_velocity`, and `*_ratio` are decimal fractions. `*_similarity` is 0–1.** The weighted formula sums score columns directly, so mixing a 0–1 value into it produces a wrong answer with no error raised. This is the most likely silent bug in the system.
3. **`timestamptz`, never `timestamp`.** Bucket days using `(sold_at at time zone restaurants.timezone)::date`. A Friday 11pm Houston sale is not a Saturday sale, and every baseline depends on getting this right.
4. **The service role key bypasses RLS entirely.** It lives only in Edge Function secrets, and only `job-*` functions use it. User-facing functions use the anon key plus the caller's forwarded `Authorization` header. A user-facing function using the service role has silently disabled authorization.
5. **Three access classes, not one.** Tenant-scoped tables are filtered by ownership; `trends` and `trend_signals` are shared read-only to all authenticated users; `raw_signals` and `ingest_runs` have RLS on with zero policies. Applying the tenant pattern to a global table is impossible — those tables have no `restaurant_id` — and getting the classes wrong is how one restaurant sees another's data.
6. **Snapshots in `opportunities` are intentional.** The component scores and `estimated_cost` duplicate values from `trends` and `menu_items` on purpose. Do not refactor them into a live join. A recommendation made in September must still explain itself in October after the trend faded and the price changed.
7. **Ingestion is idempotent via `raw_signals (source, source_id)`.** `source_id` must be stable across runs. An unstable one re-inserts the same evidence every run and inflates trend scores with no error anywhere.
8. **`sales` uploads never create menu items.** An unmatched name is a row-level error on the upload, and the sale lands with a null `menu_item_id` so revenue stays correct. `menu` uploads upsert; `inventory` uploads may create ingredients. Auto-creating menu items from a typo corrupts the data every score depends on.
9. **`_shared/domain/` has zero I/O.** No database calls, no `fetch`, no env vars. Plain data in, plain data out. This is what makes scoring testable without a database and portable to another language later.
10. **Never add MongoDB, Redis, Kafka, Kubernetes, microservices, an event bus, or custom auth.** Each solves a problem this project does not have while adding a failure mode it would then own. `raw_signals.processed_at is null` with a partial index is the queue.

## Build order

Database first, then pure logic, then the functions that call it.

- [ ] `0001`–`0008` migrations: enums → tenancy → restaurant state → external signals → opportunities → activation → views → RLS
- [ ] `seed.sql`: one restaurant, ~12 priced menu items, ingredients wired to items, an inventory count, ~90 days of sales with real weekday/weekend variation, 5 trends with signals from 2+ sources
- [ ] `_shared/`: `clients.ts`, `http.ts`, `auth.ts`, `csv.ts`, generated `db.types.ts`
- [ ] `_shared/domain/`: `matching.ts`, `scoring.ts`, `economics.ts`, with unit tests (including the assertion that scoring weights sum to 1.0)
- [ ] `uploads/`: signed URL, record, process — all three CSV kinds
- [ ] `job-ingest-trends/`: `manual` and seeded adapters
- [ ] `job-generate-opportunities/`: write opportunities plus evidence rows
- [ ] `opportunities/`: accept, reject
- [ ] `campaigns/`: create from opportunity, generate per-channel assets via LLM
- [ ] `experiments/`: create from campaign, measure against baseline

The seed dataset is listed second for a reason. Without the weekday variation in sales, the baseline math is untestable, and the baseline is what the entire experiment layer rests on.

## Deferred, with known cost

Not built for the MVP. Each has a concrete estimate in [`extensibility.md`](./extensibility.md): live Reddit, Google Trends, and TikTok adapters; `pgvector` embedding matching; `pg_cron` scheduling; multi-user teams; POS integrations; statistical significance testing.

Only [multi-user](./extensibility.md#multi-user-restaurants) and [multi-location](./extensibility.md#multi-location-restaurant-groups) require rewriting existing code, because they change the shape of ownership. Everything else is additive. That is why every RLS policy calls the `public.owns_restaurant()` helper instead of inlining the ownership check — when membership rules change, one function changes and ~15 policies follow for free.
