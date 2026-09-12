# MiseEnVue — Project Plan

## What this is

A small-business aid tool for restaurants that turns social media food trends into
concrete menu and marketing decisions. The flow is a loop:

**social media → restaurant → social media**

1. **Trend ingestion (Part 1)** — pull signals from Reddit, Instagram, TikTok, and
   Google Trends. Produce a ranked list of trending dishes, each annotated with
   *why* it is trending.
2. **Fit analysis (Part 2)** — the owner uploads an inventory CSV and their current
   menu. The system scores which trending dishes the restaurant can realistically
   execute, and surfaces the best fits. The owner picks what to pursue.
3. **Campaign generation (Part 3)** — for the chosen dish(es), generate a campaign
   strategy across IG / Facebook / TikTok ads, plus a shortlist of local influencers
   to approach.

This document covers the whole flow for context, then plans **Part 1 in detail** —
that is the scope of the `harsh` branch.

---

## Part 1: Trend Ingestion Pipeline (this branch)

### Goal

Given no input other than an optional location/cuisine filter, output a ranked list
of trending dishes with evidence attached. This is the upstream half of the product;
everything downstream consumes its output.

### Output contract

The one thing other parts depend on. Everything else in Part 1 is an implementation
detail behind this shape.

```json
{
  "generated_at": "2026-09-12T00:00:00Z",
  "dishes": [
    {
      "id": "chili-oil-honey-wings",
      "name": "Chili oil honey wings",
      "aliases": ["hot honey wings", "chili crisp wings"],
      "cuisine_tags": ["american", "asian-fusion"],
      "trend_score": 87.4,
      "momentum": "rising",
      "why_trending": {
        "summary": "Short-form video driven; chili crisp crossover into bar food.",
        "drivers": ["visual sizzle shots", "cheap ingredient swap on existing wings"],
        "audience": "18-34, casual dining"
      },
      "evidence": [
        {
          "source": "reddit",
          "url": "...",
          "excerpt": "...",
          "engagement": 4200,
          "observed_at": "2026-09-10T00:00:00Z"
        }
      ]
    }
  ]
}
```

Part 1 stops at "what is trending and why." It does not reason about ingredients,
cost, or feasibility — those are Part 2's concerns, derivable from `name` and
`aliases` without needing anything else from here.

`evidence` is never dropped — the owner must be able to see the receipts behind a
recommendation.

### Architecture

Four stages, each independently runnable and cacheable to disk:

```
connectors/  →  normalize  →  extract & cluster  →  score  →  trends.json
 (raw pulls)    (common      (dish entities +      (rank +
                 Post shape)  why-trending)         momentum)
```

**1. Connectors** — one module per source, all exposing the same
`fetch(query, since) -> list[RawPost]` interface so sources can be added or dropped
without touching downstream code.

| Source | Access path | Notes |
|---|---|---|
| Reddit | official API via PRAW | Easiest real data. Target r/food, r/FoodPorn, r/recipes, r/KitchenConfidential, plus local city subs. |
| Google Trends | `pytrends` | Gives momentum/velocity per search term — best signal for "is this rising or dying". |
| TikTok | hashtag/creative-center scrape | No open API. Treat as best-effort; fall back to a cached snapshot. |
| Instagram | hashtag pull | Most restricted. Lowest priority; cached snapshot is acceptable for demo. |

Every connector writes its raw pull to `data/raw/<source>/<timestamp>.json`. Nothing
re-hits a network API during development — the pipeline is replayable offline from
cache, which matters both for rate limits and for a stable demo.

**2. Normalize** — map each source's payload into a single `Post` record:
`{source, id, url, text, created_at, engagement, media_type, location?}`.
Engagement is normalized per-source into a 0–1 percentile within that source's pull,
so a Reddit upvote count and a TikTok view count are comparable.

**3. Extract & cluster** — the interesting part.
- Run an LLM extraction pass over batched posts to pull dish mentions and the
  stated/implied reason for interest.
- Cluster surface forms into one dish entity ("hot honey wings" / "chili crisp
  wings" → one dish, the rest become `aliases`). Start with embedding similarity +
  a threshold; a manual alias override file handles the cases it gets wrong.
- Synthesize `why_trending` from the clustered evidence, not from model priors —
  the summary must be grounded in the posts actually collected.

**4. Score** — `trend_score` combines:
- **Volume** — how many distinct posts mention the dish
- **Velocity** — growth vs. the prior window (Google Trends carries most of this)
- **Cross-source breadth** — a dish on three platforms beats a dish on one
- **Recency** — decay older posts

Weights live in one config file so they can be tuned in the demo instead of being
buried in code. `momentum` is derived from velocity alone: `rising` / `steady` /
`fading`.

### Proposed layout

```
ingestion/
  connectors/       reddit.py, google_trends.py, tiktok.py, instagram.py, base.py
  normalize.py
  extract.py        LLM extraction + clustering
  score.py
  pipeline.py       CLI entrypoint: run all stages, write trends.json
  config.yaml       subreddits, keywords, scoring weights
data/
  raw/              cached source pulls (gitignored)
  out/trends.json   the contract above
tests/
  fixtures/         small frozen raw pulls, committed
```

Python throughout. `pipeline.py` is a CLI (`python -m ingestion.pipeline --since 7d`)
so Part 2 can shell out to it or just read `trends.json` — no service required yet.

### Build order

1. `base.py` connector interface + `Post` schema + the `trends.json` schema. Commit
   the schema first; it is the handshake with Parts 2 and 3.
2. Reddit connector end-to-end with caching. One real source beats four stubs.
3. Normalize + a naive scorer (volume only). Now the pipeline produces real output.
4. LLM extraction and clustering — the step that makes output useful rather than a
   keyword count.
5. Google Trends connector for velocity; upgrade the scorer to the full formula.
6. TikTok, then Instagram, as time allows. Both are explicitly optional.

Stop after step 5 if time runs short — the product demos fine on Reddit + Google
Trends, and the connector interface means the other two slot in without rework.

### Risks

- **TikTok/Instagram access.** No reliable open API. Mitigation: cached snapshots
  committed as fixtures; the demo never depends on a live scrape succeeding.
- **Dish clustering quality.** Over-merging ("wings") or under-merging (three
  entries for one dish) both look bad on screen. Mitigation: alias override file,
  and cap output at the top ~20 dishes where quality is checkable by eye.
- **Rate limits mid-demo.** Mitigation: cache-first design; `--offline` flag replays
  the last pull.

### Done when

- `python -m ingestion.pipeline` writes a valid `data/out/trends.json` from live
  Reddit + Google Trends data.
- Every dish carries at least one real evidence item with a working URL.
- The same command runs offline from cached fixtures.
- Part 2 can consume `trends.json` without asking Part 1 for anything else.

---

## Interfaces to Parts 2 and 3

- **Part 1 → Part 2:** `data/out/trends.json`, and nothing else. Part 2 matches
  `name`/`aliases` against the uploaded menu, and derives whatever ingredient or
  cost model it needs for the inventory CSV on its own side — so the ingredient
  vocabulary stays internal to Part 2 rather than becoming a cross-branch contract.
- **Part 2 → Part 3:** the owner's selected dish, carrying its `why_trending` and
  `evidence` forward — the campaign copy should be built from the same reasons the
  dish surfaced in the first place.
