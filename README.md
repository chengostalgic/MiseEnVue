# MiseEnVue

Turns viral food trends into menu and marketing decisions a restaurant can
afford. Inspiration can come from next door, another US city, or anywhere a
plate is working. Nearby demand is one factor — not the fence.

Two independent halves, each producing a JSON file that downstream parts read:

| Half | Command | Output |
|---|---|---|
| Financial baseline | `python3 -m finance.budget` | `data/out/budget.json` |
| Trend ingestion | `python3 -m ingestion.pipeline` | `data/out/trends.json` |

The Next.js app reads those files. It does not scrape on request.

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

Finds dishes going viral across food media, clusters mentions across
creators, and explains why each is trending with evidence attached. Nearby
reviews are one signal alongside city, US, and worldwide takes.

```
python3 -m ingestion.pipeline --offline --dry-run   # free, replays cached data
python3 -m ingestion.pipeline --since 14            # live pull, writes output
python3 -m ingestion.pipeline --offline --force     # overwrite from cache
```

`--offline` replays the last cached pull in `data/raw/`. It costs no YouTube
quota and needs no YouTube key, but still calls Claude for extraction. With no
cache, that source is skipped.

`--force` is required to overwrite `data/out/trends.json` while it carries
`_meta.hand_written`, which guards the hand-authored contract sample.

### How it works

1. Pull recent uploads from ~33 curated US food channels listed in
   `ingestion/config.yaml`. This uses the uploads playlist at 1 quota unit per
   channel rather than keyword search at 100.
2. Filter: channel country, declared language, a minimum view floor, and an
   engagement gate on Shorts.
3. Optionally read nearby Maps reviews. Playwright can open Google Maps with
   the restaurant's city injected so "food near me" is that market, not the
   scrape machine's IP. The same dish named at several independent restaurants
   in 14 days is useful nearby evidence — it does not disqualify a plate from
   another city or country.
4. Score virality per video. The key measure is breakout ratio, a video's views
   against its own channel's median, which separates a dish going viral from a
   large channel posting something ordinary. Maps uses restaurant count.
5. Cluster posts into dishes with Claude. YouTube titles and Maps reviews are
   separate passes so a nearby spike is not buried under raw view counts, and
   a Seoul or LA breakout is not dropped for lacking a local mention.
6. Synthesize why each dish is trending, grounded only in that dish's own posts
   and comments.
7. Score and rank on reach, virality, velocity, volume, breadth, recency, and
   nearby review spikes as one factor among them.

First Maps run needs a Chromium install:

```
playwright install chromium
```

A run takes three to five minutes plus the Maps pass, and costs roughly 70
YouTube quota units and $0.35 in Claude calls. Maps uses no API quota. If
Playwright is missing or Google blocks the session, Maps is skipped and the
YouTube half still writes.

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

## Frontend

The app reads `data/out/trends.json` and `data/out/budget.json`. Discover lists
the scrape ranking. Decide turns those dishes into pairings. Kitchen fit uses
the selected scrape dish, not a hardcoded name.

```
cd backend && supabase start && supabase db reset
cd ../frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Sign in as `owner@miseenvue.test` / `password123` for Ember & Rye, or
`owner3@miseenvue.test` / `password123` for Night Owl Noodles.

## Frontend integration

The trend pipeline is a batch job, not a request handler. It takes minutes, and
the answer is the same for every restaurant, so it should run once and be read
many times rather than being triggered per request. Read `data/out/trends.json`
directly, or serve it from `/api/trends`.

When you are signed in, Decide POSTs `/api/sync`: it writes `trends.json`
into the global `trends` table and scores each dish against that restaurant's
menu, inventory, and sales. Ember & Rye and Night Owl Noodles therefore see
different pairings from the same scrape. Add `SUPABASE_SERVICE_ROLE_KEY`
(from `supabase status`) so those writes can land — layer 3 is service-role
only. Without it, Decide still shows the seeded opportunities.

The restaurant-specific filtering belongs in Part 2, which combines
`trends.json` with the menu, inventory, and the `constraints` from
`budget.json`.

## Deploy

Keep the Vercel **Root Directory** at the repo root (leave it empty), not
`frontend/`. The root `package.json` lists `next` so Vercel can detect the
framework. The build command must stay `npm run build`.

Without hosted env vars the site opens in **demo mode** (scrape contract + API
fallbacks, no login). To attach a real restaurant, add these in Vercel →
Settings → Environment Variables from a hosted Supabase project (not
`127.0.0.1`):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
```

## Notes

- Google Trends is wired in as optional enrichment only. `pytrends` was archived
  in April 2025 and its maintained fork hits the same per-IP rate limit, so
  momentum is derived from video velocity instead. A reachable Trends reading
  still takes precedence when present.
- Reddit is not used. Self-service API registration closed under its Responsible
  Builder Policy, and unauthenticated endpoints return 403.
- `data/raw/` is gitignored. Kitchen CSVs under `data/fixtures/` are example
  uploads, not scrape results. `data/out/trends.json` is written by a live
  pipeline run, not checked in as a frozen board.
