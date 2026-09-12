# MiseEnVue

```text
backend/     Supabase schema, seed, RLS
frontend/    The Next.js app (auth + opportunities + research + kitchen)
agent/       Gemini client, prompts, CLI
ingestion/   YouTube + Google Trends scrape and ranking
finance/     P&L baseline and budget allocation
data/out     Pipeline artifacts (not backend, not frontend)
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
