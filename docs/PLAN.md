# MiseEnVue — Project Plan

## What this is

A small-business aid tool for restaurants that turns social media food trends into
concrete menu and marketing decisions. The flow is a loop:

**social media → restaurant → social media**

**Part 1 — Financial baseline + trend ingestion** (this branch)

1. **1A. Financial baseline.** The owner uploads a P&L. The system derives their
   unit economics, compares them against restaurant industry benchmarks, and
   computes what they can *actually afford* to spend chasing a trend — split
   across menu experimentation, paid social, and influencer outreach.
2. **1B. Trend ingestion.** Pull signals from YouTube and Google Trends at both
   national and local scope. Produce a ranked list of trending dishes, each
   annotated with *why* it is trending.

**Parts 2 and 3 — downstream**

3. **Fit analysis (Part 2).** The owner uploads an inventory CSV and current menu.
   The system scores which trending dishes they can realistically execute — now
   bounded by the budget from 1A, not just by what is in the walk-in.
4. **Campaign generation (Part 3).** For the chosen dish, generate a campaign
   across IG / Facebook / TikTok plus local influencers — sized to the allocation
   from 1A rather than to an imaginary budget.

**Why the money comes first.** A trend recommendation with no budget attached is
advice, not a decision. A restaurant running a 72% prime cost cannot afford a $4,000
influencer campaign no matter how well birria is trending, and telling them otherwise
is worse than telling them nothing. Computing the envelope *before* surfacing trends
means every downstream recommendation arrives pre-filtered to what the business can
survive.

This document covers the whole flow for context, then plans **Part 1 in detail** —
that is the scope of the `harsh` branch.

---

## Part 1A: Financial Baseline (this branch)

### Goal

Take a restaurant P&L and answer one question: **how much can this business afford
to spend chasing a trend this month, and split how?**

### Input

`data/in/pnl.csv` — a flat line-item export, the format every POS and bookkeeping
package can produce:

```csv
line_item,monthly_amount
Food Sales,142000
Food COGS,52000
Hourly Labor,48000
Rent,14500
...
```

Line items are mapped to categories by keyword rules in `finance/config.yaml`, not
by exact string match. Real P&Ls call the same thing "Hourly Labor", "Wages - FOH",
and "Payroll - Hourly", and a parser that demands one spelling fails on every real
file. Unmapped rows are reported rather than silently dropped — a $30k line landing
in "unclassified" would quietly distort every ratio below it.

### Output contract

`data/out/budget.json`. Separate from `trends.json` because it has a different input
and a different lifecycle — the P&L changes monthly, trends change daily.

```jsonc
{
  "ratios": {
    "food_cost_pct": 0.325,
    "labor_cost_pct": 0.383,
    "prime_cost_pct": 0.708,     // the number that decides everything below
    "net_margin_pct": 0.021
  },
  "benchmarks": [
    { "metric": "prime_cost_pct", "value": 0.708, "target": "0.55-0.65",
      "status": "critical", "note": "..." }
  ],
  "health": { "band": "distressed", "score": 34 },
  "allocation": {
    "monthly_revenue": 180000,
    "total_budget": { "amount": 3600, "pct_of_revenue": 0.02 },
    "split": {
      "menu_experimentation": 1080,
      "paid_social": 1440,
      "influencer": 720,
      "reserve": 360
    }
  },
  "constraints": {
    "max_trial_ingredient_spend": 1080,
    "max_influencer_fee": 720,
    "capex_available": 0,
    "min_dish_margin_pct": 0.70
  },
  "rationale": ["..."]
}
```

**`constraints` is the load-bearing block.** Everything else is explanation; that
block is what Parts 2 and 3 must respect. `capex_available: 0` means Part 2 must
reject any dish needing new equipment. `max_influencer_fee` caps Part 3's outreach
list. Without it the budget is a number on a dashboard rather than something that
changes what gets recommended.

### The allocation logic

**Prime cost** — food plus labor as a share of revenue — sets the *band*. It is the
standard single measure of restaurant health, and structural where net margin swings
on one-off items.

| Prime cost | Band | Reinvestment share | Revenue cap |
|---|---|---|---|
| < 60% | healthy | 40% of earnings | 5% |
| 60–65% | stable | 30% | 4% |
| 65–70% | tight | 20% | 3% |
| > 70% | distressed | 10% | 2% |

**The budget is a share of earnings before marketing, not of revenue.**

```
net profit                     $14,500
+ marketing already spent      $ 3,800
= earnings before marketing    $18,300
x reinvestment share (stable)      30%
= budget                       $ 5,490     (3.0% of revenue)
```

Adding marketing back before taking a share is the point. Net profit already has
marketing deducted, so taking a cut of *it* double-counts — and a restaurant that
currently spends nothing would look like it can afford more than one spending
sensibly. Earnings before marketing is invariant to current spend, which is the
property you want: verified by feeding the same P&L with $0 and with $40,000 of
marketing, both of which yield the same $30,000 pool.

The revenue percentage is now only a **sanity cap**, not the driver, and it uses the
independent-restaurant scale (2–5%) rather than the established/multi-unit 3–6%.
Sources are explicit that the 3–6% bracket is the wrong benchmark for an independent
under $5M; this client is $2.16M/year.

A **floor** of 1% of revenue keeps a struggling operation from going completely
dark. `binding_constraint` reports which of the three applied — "limited by
earnings" and "limited by benchmark" are different conversations.

**Two figures make the number defensible**, both computed from the P&L:

*Contribution margin* — revenue minus variable costs (COGS + hourly labor; salaried
management and rent don't move when one more table sits down). The sample P&L
computes to 47.3%.

*Break-even* — what the spend has to generate to pay for itself:
`budget ÷ contribution margin ÷ average check`. For the stable sample: $7,200 needs
$15,212 incremental revenue, **about 13 extra covers per day**. That is a bar, not a
forecast — it does not claim the spend will work, it states what "working" means, and
the owner can judge that against their own floor.

*Current spend* is compared too. The sample already spends $3,800/month, so the
recommendation is a **1.9x increase** — materially different information from a bare
$7,200, and the P&L already contains it.

**Where the constants come from.** The band thresholds, benchmark percentages,
payout ratios, and splits are industry convention, not derived from this
restaurant's history. They are cited inline in `finance/config.yaml`:

| Constant | Value | Source |
|---|---|---|
| Food cost | 28–35% (avg 32.4%) | NRA 2026 State of the Industry |
| Labor | 30–35% target | BLS food-services / NRA 2026 — note 2025 median is **36.5%**, so this is a target, not a median |
| Prime cost | 60–65% full-service | Industry consensus |
| Marketing | 3–6% of revenue (established); 2–5% for independents under $5M | ChowNow, Back of House, The Forking Group |
| Digital share | 60–80% of marketing spend | Same — supports the 62–67% paid social + influencer split |

Two honest caveats:

- **The distressed band's 2% is below every published range.** That is an editorial
  judgment, not a sourced figure: a restaurant above 70% prime cost has a cost
  problem, not a demand problem. It is marked as such in the config.
- **The labor benchmark flags most real restaurants as over.** 2025 median
  full-service labor is 36.5% against a 30–35% target, so a genuine P&L will often
  show "critical" on that line. That is accurate, not a bug — but it means the flag
  reflects an industry-wide condition, not necessarily this operator's failing.

The distressed case matters most and is the one a naive tool gets wrong. A
restaurant at 72% prime cost does not need a bigger campaign — it needs its food or
labor cost fixed, and spending its remaining margin on ads accelerates the failure.
The output says so plainly in `rationale` instead of quietly recommending a small
number.

The split across menu experimentation / paid social / influencer / reserve comes
from `finance/config.yaml` and shifts by band: distressed restaurants get a bigger
reserve and proportionally more experimentation (cheap, reversible) than paid social
(expensive, slow to pay back).

### What this deliberately does not do

No forecasting, no ROI projection, no "this campaign will return 3.2x." Those
numbers would be fabricated — there is no historical campaign data to fit against,
and inventing a return multiple for a judge is the kind of thing that falls apart
under one question. The tool computes what is affordable from real inputs and stops
there.

---

## Part 1B: Trend Ingestion Pipeline (this branch)

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
| YouTube Shorts | Same API, second pass gated on engagement rate | Shorts are where trends break first — and where engagement bait lives. See below. |
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

Three tiers, narrowest wins when a post matches more than one.

| Scope | How | What it answers |
|---|---|---|
| National | Category queries: "viral chicken recipe" | What is rising anywhere — where being early comes from |
| Regional | State templated in: "{region} food trend" | Food-scene coverage relevant to this market that never names the city |
| Local | City templated in: "{city} best new restaurant" | What this market turns up for, and what competitors already serve |

Google Trends queries all three geographies per dish (`US` / `US-TX` /
`US-TX-618`) and **falls back outward** — metro, then state, then national.

**A metro DMA is frequently too narrow to use on its own.** Verified: "qishta"
returns no data at any tier, and "chicken au poivre" returns a metro reading of
*+100%* that is an artifact of a zero baseline — nobody searched for it last week,
so one search this week is an infinite percentage. Taken at face value that dish
reads as *rising*; falling back to the state tier shows **−62.9% and fading**.
Zero-baseline readings are flagged and skipped in favour of a solid wider-tier
reading, and `momentum_basis` records which tier the answer actually came from.

Point the pipeline at a different restaurant by editing `location` in
`config.yaml`: `city`, `region_name`, `region_code`, `trends_geo`,
`trends_geo_region`.

**Google Trends DMA codes give genuinely local signal.** Verified: querying
"birria" at `US-TX-618` returns *"dripped birria katy"* and *"blk mkt birria"* —
suburb-level results, not national data with a filter over it. And the tiers do
diverge in ways that matter: "birria tacos" is **−17.9% nationally but +51% in
Houston**. A national-only view would have called that dish dead here.

**Only velocity is comparable across dishes, not interest.** Google Trends
normalizes its 0–100 interest values *within a single query batch*, so a dish
scoring 80 in one batch and 40 in another cannot be ranked against each other —
the scale is re-derived per request. Velocity is a ratio computed inside one
term's own series, so the normalization cancels. That is the only Trends figure
the scorer uses.

**YouTube's `location` + `locationRadius` parameters were tested and rejected.**
They only match videos carrying explicit geotags, which is a small and
unrepresentative slice, and results mixed genuinely local content with generic food
videos that happened to be tagged. Putting the city name in the query returned
markedly better local results and costs nothing extra.

**US-only filtering goes through channel country, not declared language.**
`defaultAudioLanguage` looked like the obvious origin signal and is not
trustworthy — it is self-reported, and an Indian village-cooking channel with
12.9M views declares `en-US`. Channel country (`channels.list`, 1 quota unit per
50 channels) is set by the owner and is accurate where present: it correctly
flags Village Cooking Channel and Foodies findings as `IN`. About 80% of
channels declare one; the rest pass through to the extraction relevance gate,
because dropping on missing metadata would take most of the legitimate US
content with it. On a live pull the gate cut 312 videos to 217 and left a
genuinely US creator set (Guga Foods, Sous Vide Everything, Dan-O's Seasoning).

**Shorts are re-admitted through an engagement gate, not a view threshold.**
The main pass sets `videoDuration=medium`, which excludes Shorts, because a first
attempt at `order=viewCount` returned Hindi-language vlogs with `#viral #recipe`
tagged on and no dish in them. But Shorts are where food trends actually break,
so a second pass pulls them and filters on **like rate and comment count** rather
than views. Bait accumulates views without earning likes or comments; genuine
food content converts at 4–8%. Filtering on raw views selects for exactly the
wrong thing — which is why the naive version failed.

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

**3. Extract & cluster** — the interesting part. Two passes, both using Claude
with structured outputs (schema enforced server-side, so a malformed response is
not a failure mode to handle mid-demo):

1. **Cluster** — batches of posts → dish assignments, carrying the running dish
   list forward. Sequential by necessity: each batch needs the dish list the
   previous one produced.
2. **Synthesize** — per dish → `why_trending`, grounded only in that dish's own
   posts and comments. Independent, so run concurrently.

**Both phases run on Haiku 4.5, not a frontier model.** Clustering is
high-volume classification and synthesis is short summarization over evidence
that has already been selected — neither needs frontier reasoning, and
clustering is where nearly all the tokens go. Measured on a real pull, Haiku
holds clustering quality (it correctly grouped chicken au poivre across three
creators) at roughly an eighth of the cost and about half the latency.

One gotcha the code handles: **Haiku 4.5 rejects adaptive thinking and the
`effort` parameter with a 400.** Requests are built per-model, so pointing
`cluster_model` or `reason_model` at an Opus or Sonnet id re-enables them
automatically.


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
  wings" → one dish, the rest become `aliases`). Each batch receives the dish list
  found so far and either matches an existing entry or coins a new one. No
  embeddings, no vector store, no similarity threshold to tune — at a few hundred
  posts the model handles it, and the alternative is an afternoon spent on
  infrastructure that a prompt replaces. Model-supplied ids are slug-normalized on
  the way in, so `Chicken-Au-Poivre` in one batch cannot split from
  `chicken-au-poivre` in another.
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
finance/
  pnl.py            line-item CSV -> categorized totals + ratios
  allocate.py       benchmarks, health band, budget + constraints
  budget.py         CLI entrypoint: writes data/out/budget.json
  config.yaml       line-item keywords, benchmarks, bands, splits
ingestion/
  connectors/       youtube.py, google_trends.py, tiktok.py, base.py
  normalize.py
  extract.py        LLM extraction + clustering
  score.py
  pipeline.py       CLI entrypoint: run all stages, write trends.json
  config.yaml       search queries, scoring weights
data/
  in/               pnl.csv (client upload), pnl_distressed.csv (demo variant)
  raw/              cached source pulls (gitignored)
  fixtures/         small frozen pulls, committed — the offline demo safety net
  out/trends.json   the trend contract
  out/budget.json   the financial contract
```

Python throughout. `pipeline.py` is a CLI (`python -m ingestion.pipeline --since 7d`)
so Part 2 can shell out to it or just read `trends.json` — no service required yet.

### Build order (2-day hackathon)

**Part 1A (financial baseline) is ~4h total and is largely done.** It is also the
lower-risk half: no API keys, no quota, no scraping, and it cannot degrade at demo
time. If the schedule slips, 1A holds and 1B falls back to fixtures.


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

Part 1 emits **two** files, and they are consumed differently.

- **`data/out/trends.json` → Part 2.** Part 2 matches `name`/`aliases` against the
  uploaded menu, and derives whatever ingredient or cost model it needs for the
  inventory CSV on its own side — so the ingredient vocabulary stays internal to
  Part 2 rather than becoming a cross-branch contract.

- **`data/out/budget.json` → Parts 2 and 3.** Both read `constraints`, and both are
  expected to *enforce* it:

  | Constraint | Who enforces | Effect |
  |---|---|---|
  | `capex_available` | Part 2 | `0` means reject any dish needing new equipment |
  | `min_dish_margin_pct` | Part 2 | Dishes below this contribution margin are filtered out |
  | `max_trial_ingredient_spend` | Part 2 | Caps what a test run may cost |
  | `max_influencer_fee` | Part 3 | Caps the outreach shortlist |
  | `max_paid_social_spend` | Part 3 | Sizes the ad plan |

  A budget that does not change what gets recommended is decoration. If Part 3 can
  propose a $4,000 influencer campaign against a $720 cap, the finance work was
  cosmetic.

- **Part 2 → Part 3:** the owner's selected dish, carrying its `why_trending` and
  `evidence` forward — the campaign copy should be built from the same reasons the
  dish surfaced in the first place.

**Ordering note.** `budget.json` does not depend on `trends.json` and can be
generated first, independently. That is deliberate: the financial baseline is the
cheaper, more certain half of Part 1, so it stays useful even if trend ingestion
degrades to fixture data during the demo.
