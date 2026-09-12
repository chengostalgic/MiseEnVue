# MiseEnVue

Turns viral food trends into menu and marketing decisions a restaurant can
afford.

Two independent halves, each producing a JSON file that downstream parts read:

| Half | Command | Output |
|---|---|---|
| Financial baseline | `python3 -m finance.budget` | `data/out/budget.json` |
| Trend ingestion | `python3 -m ingestion.pipeline` | `data/out/trends.json` |

## Setup

```
pip install -r requirements.txt
```

Create `.env` in the repo root:

```
YOUTUBE_API_KEY=...
ANTHROPIC_API_KEY=...
```

The YouTube key comes from console.cloud.google.com with YouTube Data API v3
enabled. It is a plain API key, no OAuth. The finance half needs neither key.

## Financial baseline

Reads a P&L, derives unit economics, and computes what the business can afford
to spend chasing a trend.

```
python3 -m finance.budget                              # reads data/in/pnl.csv
python3 -m finance.budget --pnl path/to/your.csv
python3 -m finance.budget --dry-run                    # print, do not write
python3 -m finance.server                              # web UI on :8000
```

The P&L is a two-column CSV:

```
line_item,monthly_amount
Food Sales,142000
Food COGS,47500
Hourly Labor - BOH,24000
Rent,14500
```

Line items are matched to categories by keyword, not exact name, so real
exports work without editing. Anything unmatched is reported rather than
silently dropped.

The budget is the lower of two ceilings: a share of profit before marketing
(money that exists) and a share of revenue (the industry benchmark). The output
names which one bound it. `data/in/pnl_distressed.csv` shows the other path,
where the tool recommends cutting spend.

The `constraints` block in `budget.json` is what Parts 2 and 3 must enforce:

| Field | Enforced by | Effect |
|---|---|---|
| `capex_available` | Part 2 | 0 means reject dishes needing new equipment |
| `min_dish_margin_pct` | Part 2 | Filter dishes below this contribution margin |
| `max_trial_ingredient_spend` | Part 2 | Cap the cost of a test run |
| `max_influencer_fee` | Part 3 | Cap the outreach shortlist |
| `max_paid_social_spend` | Part 3 | Size the ad plan |

## Trend ingestion

Finds dishes going viral across US food media, clusters mentions across
creators, and explains why each is trending with evidence attached.

```
python3 -m ingestion.pipeline --offline --dry-run   # free, replays cached data
python3 -m ingestion.pipeline --since 14            # live pull, writes output
python3 -m ingestion.pipeline --offline --force     # overwrite from cache
```

`--offline` replays the last cached pull. It costs no YouTube quota and needs no
YouTube key, but still calls Claude for extraction. Use it for development and
as the demo fallback.

`--force` is required to overwrite `data/out/trends.json` while it carries
`_meta.hand_written`, which guards the hand-authored contract sample.

### How it works

1. Pull recent uploads from ~33 curated US food channels listed in
   `ingestion/config.yaml`. This uses the uploads playlist at 1 quota unit per
   channel rather than keyword search at 100.
2. Filter: channel country, declared language, a minimum view floor, and an
   engagement gate on Shorts.
3. Score virality per video. The key measure is breakout ratio, a video's views
   against its own channel's median, which separates a dish going viral from a
   large channel posting something ordinary.
4. Cluster posts into dishes with Claude, carrying the running dish list
   forward so surface forms of the same dish merge.
5. Synthesize why each dish is trending, grounded only in that dish's own posts
   and comments.
6. Score and rank on reach, virality, velocity, volume, breadth, and recency.

A run takes three to five minutes and costs roughly 70 YouTube quota units and
$0.35 in Claude calls.

### Tuning

Everything adjustable is in `ingestion/config.yaml`:

- `channels` — the creator roster. Add handles here; they are verified against
  the API on first use and cached.
- `virality` — what counts as viral. `breakout_ratio`, `min_views`,
  `trend_markers`.
- `output.min_mentions` — dishes below this many independent mentions are
  dropped. At 2, a typical run yields 12 to 15 dishes from about 175 clusters.
- `scoring.weights` — relative weight of each ranking component.

## Output contract

Both files are schema-versioned under `_meta.schema_version`. Every dish in
`trends.json` carries an `evidence` array of real video URLs with view counts,
and the sentiment percentages are auditable against those videos' comments. If
a dish has negative mentions, at least one appears in the evidence rather than
being hidden.

```
{
  "id": "chapli-kebab-chopped-cheese",
  "name": "Chapli Kebab Chopped Cheese",
  "trend_score": 87.6,
  "momentum": "rising",
  "metrics": { "mention_count": 2, "total_engagement": 870853, "sentiment": {...} },
  "why_trending": { "summary": "...", "drivers": [...], "audience": "..." },
  "evidence": [ { "url": "...", "excerpt": "...", "engagement": 858247 } ]
}
```

## Frontend integration

The trend pipeline is a batch job, not a request handler. It takes minutes, and
the answer is the same for every restaurant, so it should run once and be read
many times rather than being triggered per request. Read `data/out/trends.json`
directly, or serve it from an endpoint.

The restaurant-specific filtering belongs in Part 2, which combines
`trends.json` with the menu, inventory, and the `constraints` from
`budget.json`.

## Notes

- Google Trends is wired in as optional enrichment only. `pytrends` was archived
  in April 2025 and its maintained fork hits the same per-IP rate limit, so
  momentum is derived from video velocity instead. A reachable Trends reading
  still takes precedence when present.
- Reddit is not used. Self-service API registration closed under its Responsible
  Builder Policy, and unauthenticated endpoints return 403.
- `data/raw/` is gitignored. `data/fixtures/` and `data/out/` are committed so
  the pipeline runs offline from a fresh clone.
