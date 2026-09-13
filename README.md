# MiseEnVue

MiseEnVue connects culinary trend intelligence with restaurant financial constraints. It derives strict operational spending envelopes directly from restaurant P&L statements and pairs them with viral food trends to propose feasible, high-margin menu specials.

![MiseEnVue Autonomous Decision Card](docs/images/decision_card.png)

---

## System Architecture

The platform operates across three decoupled modules:

| Module | Component | Execution Model | Primary Output |
|---|---|---|---|
| **Financial Calibration** | `finance.budget` | Python CLI batch | `data/out/budget.json` |
| **Trend Ingestion** | `ingestion.pipeline` | Python CLI batch | `data/out/trends.json` |
| **Decision Studio** | Next.js 16 (App Router) | Interactive web application | Feasibility matrix & campaign playbooks |

Neither backend pipeline runs within HTTP request cycles. The web interface directly consumes schema-versioned JSON contracts, ensuring instantaneous responses, verifiable provenance, and offline reliability.

---

## 1. Financial Baseline Calibration

Derives unit economics from monthly profit-and-loss statements to establish the maximum capital a restaurant can allocate toward testing new menu concepts without threatening operating margins.

![Financial Envelope Calibration](docs/images/financial_envelope.png)

### Key Commands

```bash
# Calibrate spending limits from default P&L
python3 -m finance.budget

# Run against custom P&L export
python3 -m finance.budget --pnl path/to/pnl.csv

# Preview output in terminal without modifying contracts
python3 -m finance.budget --dry-run

# Launch local finance summary server on :8000
python3 -m finance.server
```

### Operational Constraints Enforced

The financial envelope enforces hard limits across five dimensions:

- **Capex Available**: Strict 0 baseline prevents recommending items that require new cooking equipment.
- **Minimum Contribution Margin**: Filters out recipes falling below target margin thresholds (e.g., ≥ 68%).
- **Trial Ingredient Budget**: Hard spending cap for initial test batches (e.g., $2,016).
- **Creator Tasting Budget**: Bounds influencer tasting honorariums (e.g., $1,440).
- **Paid Media Allocation**: Sizes social advertising budgets strictly from available profit margins (e.g., $3,024).

---

## 2. Viral Trend Ingestion Pipeline

Monitors creator upload velocity across 30+ curated food media channels, clusters scattered video mentions into canonical dishes, and synthesizes verifiable evidence packages.

### Key Commands

```bash
# Run offline using cached fixtures (0 YouTube API quota consumed)
python3 -m ingestion.pipeline --offline --dry-run

# Execute live scrape across the past 14 days
python3 -m ingestion.pipeline --since 14

# Force overwrite of trend contracts
python3 -m ingestion.pipeline --offline --force
```

### Pipeline Workflow

1. **Upload Extraction**: Scrapes uploads from channels defined in `ingestion/config.yaml` using channel upload playlists (1 quota unit per channel vs. 100 for search queries).
2. **Breakout Scoring**: Compares video view velocity against channel median views to calculate breakout ratio, isolating viral culinary innovations from baseline creator reach.
3. **Local Maps Signals (Optional)**: Injects restaurant market coordinates to capture localized Google Maps dining reviews (`playwright install chromium` required for live maps).
4. **LLM Clustering**: Aggregates disparate video mentions, creator variations, and comment threads into unified dish concepts.
5. **Evidence Provenance**: Links every trend candidate to verifiable video URLs, engagement metrics, and sentiment distribution for operator review.

---

## 3. Web Application & Decision Studio

The Next.js frontend synthesizes the financial constraints and viral trends into an operator cockpit:

- **Decide (Matrix)**: Evaluates opportunity candidates using a 5-factor scorecard (Trend Strength, Local Relevance, Menu Fit, Operational Compatibility, and Profitability).
- **Discover (Pipeline)**: Explores real-time creator velocity and breakout metrics.
- **Inventory & Menu Studio**: Parses client-side CSV files (`inventory.csv`, `menu.csv`, `sales_30d.csv`) to compute recipe coverage and inventory availability on demand.
- **Campaign Studio**: Generates tailored 4-channel promotion plans (Instagram Reels ASMR scripts, TikTok pacing guides, Facebook local ads, and VIP creator pitches).

### Local Setup

```bash
# 1. Install dependencies
pip install -r requirements.txt
cd frontend && npm install

# 2. Configure environment (optional for live AI / Supabase)
cp .env.local.example .env.local

# 3. Start local development server
npm run dev
```

Visit `http://localhost:3000` (or `http://localhost:3002` if secondary port assigned).

---

## Deployment

The application is configured for deployment on Vercel:

- **Root Directory**: Leave empty (repository root). The root `package.json` instructs Vercel to build the Next.js frontend.
- **Build Command**: `npm run build`
- **Environment Variables**:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `GEMINI_API_KEY`
- **Standalone Mode**: Without hosted Supabase or Gemini API keys, the application automatically runs in standalone demo mode backed by committed contracts in `data/out/`.
