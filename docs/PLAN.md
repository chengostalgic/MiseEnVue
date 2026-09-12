# MiseEnVue — Project Plan

## What this is

A small-business aid tool for restaurants that turns social media food trends into
concrete menu and marketing decisions. The flow is a loop:

**social media → restaurant → social media**

1. **Trend ingestion (Part 1)** — pull signals from YouTube, Google Trends, and
   (if time allows) TikTok. Produce a ranked list of trending dishes, each annotated with
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
      "metrics": {
        "window_days": 7,
        "mention_count": 342,
        "by_source": { "youtube": 310, "google_trends": 32 },
        "total_engagement": 48200,
        "sentiment": { "positive": 0.81, "negative": 0.08, "neutral": 0.11 },
        "negative_theme": "Cloyingly sweet when the honey is overdone.",
        "local_mention_count": 11
      },
      "why_trending": {
        "summary": "Short-form video driven; chili crisp crossover into bar food.",
        "drivers": ["visual sizzle shots", "cheap ingredient swap on existing wings"],
        "audience": "18-34, casual dining"
      },
      "evidence": [
        {
          "source": "youtube",
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

Three things carry the product, and each answers a different owner question:

- **`name`** — what would go on the menu.
- **`why_trending`** — why anyone cares, which is also the raw material for Part 3's
  campaign angle.
- **`metrics`** — the hard numbers behind the recommendation. `trend_score` alone is
  an opaque composite nobody has reason to trust; "342 mentions in 7 days, 81%
  positive" is what actually convinces someone to change a menu. The score
  summarizes the evidence, it never replaces it.

`negative_theme` is a string rather than just the `negative` percentage on purpose.
A bare `0.18` is a dead end; "arrives soggy by delivery" tells the restaurant how to
differentiate and hands Part 3 a campaign angle. Negative sentiment is a feature of
the output, not a warning label on it.

`evidence` is never dropped — the owner must be able to see the receipts behind a
recommendation.

A hand-written sample lives at `data/out/trends.json` (`_meta.fixture: true`) so
Parts 2 and 3 can build against the real shape today. The pipeline overwrites that
same path.

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
| YouTube | Data API v3, API key | **Primary.** Instant self-service key, no approval. Titles give dish names, comments give sentiment, view counts give volume. |
| Google Trends | `pytrends` | Velocity per term — the rising/fading signal. No auth. |
| TikTok | hashtag / creative-center scrape | **Stretch.** No open API; scrapers break without warning. |
| Instagram | hashtag pull | **Cut unless everything else is done.** Most restricted of the four. |
| ~~Reddit~~ | ~~PRAW~~ | **Not available.** See below. |

**Why not Reddit.** It was the original primary and is no longer obtainable. Under
the Responsible Builder Policy announced in late 2025, Reddit closed self-service
API registration — new OAuth apps require manual approval through a ticket form
with an unpredictable turnaround. Verified separately: unauthenticated JSON
endpoints (`/r/*/hot.json`, both `www` and `old`) now return 403 regardless of user
agent, so there is no no-auth path either. Nothing here is a workaround away; the
access simply is not available on a two-day timeline.

### Local relevance

A trend is only useful to this restaurant if it means something in *this* market,
so every source is queried at two scopes and the results are kept distinct.

| Scope | How | What it answers |
|---|---|---|
| National | Category queries: "viral chicken recipe" | What is rising anywhere — where being early comes from |
| Local | Same API, city templated in: "{city} best new restaurant" | What this market actually turns up for, and what competitors already serve |
| Local (search) | Google Trends DMA code, e.g. `US-TX-618` | True metro-level search velocity |

Point the whole pipeline at a different restaurant by editing three values under
`location` in `config.yaml`: `city`, `region_code`, `trends_geo`.

**Google Trends DMA codes are the strongest local signal available.** Verified:
querying "birria" at `US-TX-618` returns *"dripped birria katy"* and *"blk mkt
birria"* — suburb-level results, not national data with a filter over it.

**YouTube's `location` + `locationRadius` parameters were tested and rejected.**
They only match videos carrying explicit geotags, which is a small and
unrepresentative slice, and results mixed genuinely local content with generic food
videos that happened to be tagged. Putting the city name in the query returned
markedly better local results and costs nothing extra.

**Two consequences worth knowing:**

*Local and national content differ by four orders of magnitude in engagement.*
Houston restaurant reviews pull 20–900 views; national recipe videos pull hundreds
of thousands. Percentile-normalizing them in one pool puts every local video in the
bottom percentile and silently deletes the local signal. `normalize()` therefore
groups by `(source, scope)`, not source alone — a 900-view Houston review is a
strong local result and scores like one.

*The national/local gap is itself the insight.* `metrics.local_mention_count` is
surfaced rather than folded into `trend_score`, because a dish trending nationally
with zero local mentions is either an early opening or a poor fit for local taste —
and the owner is far better placed than the pipeline to judge which.

**Why YouTube replaces it well.** Three API calls cover the whole job: `search.list`
finds recent food videos, `videos.list` returns view/like/comment counts, and
`commentThreads.list` returns the comments. That last one matters most —
titles and descriptions are creator marketing copy and skew promotional, so reading
them for sentiment would report every dish at ~100% positive. The comments are where
someone says a dish looks dry or that they are sick of seeing it, which is where
`sentiment` and `negative_theme` actually come from. Quota is 10,000 units/day and
only `search.list` is expensive at 100 units, so roughly 100 searches a day at 50
results each — far more than a 7-day window needs.

**What is lost.** Reddit had an industry voice that YouTube does not:
r/KitchenConfidential is where a line cook says corn ribs are a prep hazard. That
operational perspective is gone, and YouTube comments are consumer-side only.
**What is gained:** view counts are a harder volume signal than upvotes, and food
video virality tends to lead restaurant demand rather than follow it.

YouTube + Google Trends is the plan. TikTok and Instagram are a scraping rabbit hole
with no bounded time cost, which is the wrong shape of task for a two-day build; the
connector interface is there so they can be added later, not so they must be.

Every connector writes its raw pull to `data/raw/<source>/<timestamp>.json`. Nothing
re-hits a network API during development — the pipeline is replayable offline from
cache, which matters both for rate limits and for a stable demo.

**2. Normalize** — map each source's payload into a single `Post` record:
`{source, id, url, text, created_at, engagement, comments[], scope, media_type,
location?}`.
Engagement is normalized per-source into a 0–1 percentile within that source's pull,
so a YouTube view count and a TikTok like count are comparable.

`text` and `comments` are deliberately separate fields because they carry opposite
biases. `text` (title + description) identifies the dish but is written by someone
promoting it; `comments` is the audience talking back. Extraction reads the first for
identity and the second for sentiment.

**3. Extract & cluster** — the interesting part.

The unit of extraction is a **dish** — something an owner could put on a menu and a
campaign could be built around. This is a hard filter, not a preference. Ingredient
trends ("chili crisp is everywhere"), technique trends, and format trends are real
signals but are not outputs: nobody drives foot traffic with Lao Gan Ma. They get
resolved into the dish that carries them, and recorded as a *driver* in
`why_trending` — which is where they're actually useful, since "this ingredient is
having a moment" is a strong campaign angle for Part 3. If a trend can't be resolved
to a nameable dish, it is dropped.

- Run an LLM extraction pass over batched posts to pull dish mentions and the
  stated/implied reason for interest. The prompt states the dish-level constraint
  explicitly and instructs the model to return nothing rather than emit a bare
  ingredient or technique.
- Cluster surface forms into one dish entity ("hot honey wings" / "chili crisp
  wings" → one dish, the rest become `aliases`). Do this **inside the same LLM
  call** by passing the dish list found so far and asking the model to either match
  an existing entry or start a new one. No embeddings, no vector store, no
  similarity threshold to tune — at a few hundred posts the model handles it, and
  the alternative is an afternoon spent on infrastructure that a prompt replaces.
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
  connectors/       youtube.py, google_trends.py, tiktok.py, base.py
  normalize.py
  extract.py        LLM extraction + clustering
  score.py
  pipeline.py       CLI entrypoint: run all stages, write trends.json
  config.yaml       search queries, scoring weights
data/
  raw/              cached source pulls (gitignored)
  fixtures/         small frozen pulls, committed — the offline demo safety net
  out/trends.json   the contract above
```

Python throughout. `pipeline.py` is a CLI (`python -m ingestion.pipeline --since 7d`)
so Part 2 can shell out to it or just read `trends.json` — no service required yet.

### Build order (2-day hackathon)

**Hour 1 — hand-write `data/out/trends.json` with 10 plausible fake dishes and push
it.** Before any connector exists. Part 2 is blocked on the *shape* of this file,
not its contents, and every hour they wait is an hour of integration debt that comes
due at 3am on day 2. Fake data now means Part 2 builds against the real contract all
weekend and the swap to live data is a one-line path change.

Then, in order:

1. **YouTube connector + caching** (~3h). One real source beats four stubs. Cache
   every pull to disk from the start — retrofitting it later is worse than it sounds.
   Pull comments alongside videos; they are the only sentiment signal available.
2. **Normalize + volume-only scorer** (~2h). The pipeline now produces real output
   end to end, even if the ranking is dumb. End-to-end early is worth more than any
   single stage being good.
3. **LLM extraction + clustering** (~4h). The step that turns a keyword count into a
   product. This is the demo. Budget the most time here and protect it.
4. **Google Trends + full scoring formula** (~2h). Adds the velocity signal and
   `momentum`, which is what makes the output feel like intelligence rather than a
   leaderboard.
5. **Stretch only:** TikTok. Instagram if the laws of physics change.

**Ship after step 4.** YouTube + Google Trends + good extraction is a complete demo.
Day 2 afternoon is for the demo script, edge cases, and the handoff to Part 2 — not
for a fifth connector.

### Hackathon constraints

- **No tests, no service, no database.** JSON files on disk, one CLI entrypoint.
  Fixtures exist for demo safety, not coverage.
- **Cache-first is non-negotiable.** Not for elegance — a rate limit or dead wifi
  during judging is the single most likely way this demo dies. `--offline` replays
  the last good pull and must work from the first commit.
- **Config over code.** Search queries and scoring weights in `config.yaml`
  so tuning during the demo doesn't mean editing Python at 2am.
- **Cap output at ~15–20 dishes.** Small enough to eyeball for quality before
  presenting, which is the only QA process there's time for.

### Risks

- **Extraction quality is the whole demo.** Over-merging ("wings") or under-merging
  (three rows for one dish) is what judges will actually notice. Mitigation: it's
  a prompt, so it's fast to iterate — leave time on day 2 to iterate on it, and
  eyeball the top 20 before presenting.
- **Rate limits or no wifi mid-demo.** Mitigation: cache-first design, `--offline`
  flag, and a known-good `trends.json` committed before judging.
- **Scope creep into TikTok/Instagram.** Scraping has unbounded time cost.
  Mitigation: they are stretch goals, and the plan explicitly ships without them.
- **YouTube quota exhaustion.** 10,000 units/day, and `search.list` costs 100 per
  query. Nine queries (six national + three local) is ~900 units per run, so
  roughly eleven live runs a day. A tight edit-run loop on five queries burns the budget faster than it
  looks, and the quota resets on Pacific midnight, not on a rolling window.
  Mitigation: develop against `--offline` by default and reserve live pulls for
  when the output actually needs refreshing.
- **Sentiment skew.** YouTube comments are consumer-side and generally warmer than
  Reddit's. Expect `negative_theme` to be thinner than the sample data suggests,
  and do not treat a high positive percentage as validation on its own.

### Done when

- `python -m ingestion.pipeline` writes a valid `data/out/trends.json` from live
  YouTube + Google Trends data.
- Every dish carries at least one real evidence item with a working URL.
- Sentiment is derived from real viewer comments, not creator descriptions.
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
