# MiseEnVue

```text
backend/     Supabase schema, seed, RLS
frontend/    The Next.js app (auth + opportunities + research + kitchen)
agent/       Gemini client, prompts, CLI
ingestion/   YouTube + Google Trends scrape and ranking
finance/     P&L baseline and budget allocation
data/out     Pipeline artifacts (not backend, not frontend)
```

## How the scrape fits

The Python jobs are **batch**, not the Next.js request path:

1. `python -m finance.budget` reads a P&L and writes `data/out/budget.json` — the monthly spending envelope.
2. `python -m ingestion.pipeline` (or `--offline`) pulls YouTube + Google Trends and writes `data/out/trends.json` — ranked dishes and evidence.
3. The app reads those files. Opportunities stay in Supabase. Research lists the scraped dishes, then Gemini can live-enrich a pick.

```bash
python -m finance.budget
python -m ingestion.pipeline --offline   # replay fixtures; drop --offline for a live pull
```

## Run

```bash
cd backend && supabase start && supabase db reset
cd ../frontend
cp .env.local.example .env.local   # add local anon key + GEMINI_API_KEY
npm install
npm run dev
```

Sign in as `owner@miseenvue.test` / `password123` for Ember & Rye (full loop), or
`owner3@miseenvue.test` / `password123` for Night Owl Noodles (menu only, no sales).

Upload-shaped fixtures live in `data/fixtures/`.

```bash
cd agent
cp .env.example .env               # GEMINI_API_KEY
npm install
npm run pipeline -- --topic "Hot Honey"
```

Reports write to `data/reports/`. The CLI reads `data/out/trends.json` for `--contract`.

## Deploy

Keep the Vercel **Root Directory** at the repo root (leave it empty), not `frontend/`. The root `package.json` lists `next` so Vercel can detect the framework; workspaces still install `frontend` and `agent`. Tailwind’s Linux native binaries are declared as optional deps so `next build` can compile CSS on Vercel. The build command must stay `npm run build` (or the `vercel.json` command) — a bare `next build` at the repo root will not find the app.

Without hosted env vars the site opens in **demo mode** (scrape contract + API fallbacks, no login). To attach a real restaurant, add these in Vercel → Settings → Environment Variables from a hosted Supabase project (not `127.0.0.1`):

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
GEMINI_API_KEY
```
