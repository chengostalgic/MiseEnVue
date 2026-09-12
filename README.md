# MiseEnVue · Real-Time Social Trend Intelligence & CSV Studio (Next.js)

An end-to-end intelligence engine built with **Next.js 14 (App Router)**, **TypeScript**, and **Tailwind CSS**. It **Identifies**, **Analyses**, and **Acts** on viral social trends across **Instagram, TikTok, Facebook, and Influencers** in **real-time** using live **Google Search Grounding** and an **AI Brain (Gemini 2.5 Flash / Backboard AI)**, paired with a CSV & Inventory Fit Studio.

---

## ⚡ Real-Time Architecture (Not a Simulator)

Unlike static mocks or simulators, this pipeline connects to live signals:

1. **Live Google Search & Social Grounding**: Real-time web and social search grounding directly via Gemini 2.5 Flash (`tools: [{ googleSearch: {} }]`). Every query pulls live view counts, engagement spikes, current audience comments, and real web citations.
2. **Real-Time API Routes**:
   - `GET/POST /api/trends`: Ingests live social signals for any dish/topic in real-time.
   - `POST /api/analyze`: Synthesizes viral hook psychology, cross-platform dynamics, and 80%+ margin safeguards.
   - `POST /api/campaign`: Generates production-ready IG Reels storyboards, TikTok fast cuts, Facebook community posts, and influencer outreach DMs.
   - `POST /api/fit`: Matches an uploaded inventory CSV against active viral trends to calculate ingredient coverage %, recipe costs, and unit margins.

---

## 🚀 The 3-Stage Pipeline (Identify • Analyse • Act)

```
[1. IDENTIFY]           ──▶   [2. ANALYSE]              ──▶   [3. ACT]
Live Social Grounding          The AI Brain (Gemini/Backboard)  Campaign Playbook & Execution
• Instagram Reels & Audio      • 3-Second Viral Hook Triggers   • IG Reels 14s Storyboard
• TikTok FYP Sounds & Cuts     • Cross-Platform Dynamics        • TikTok 9s Fast Cut
• Facebook Community Buzz      • Audience Demand & Objections   • Facebook Storytelling Post
• Influencer Reviews & DMs     • Unit Economics & 80%+ Margins  • Creator Collab Outreach DMs
```

---

## 💻 Running the App

### Option A: Next.js Web UI
```bash
# Install dependencies
npm install

# Run development server (runs on port 3002)
npm run dev

# Build for production
npm run build
```
Open **`http://localhost:3002`** in your browser to view the interactive real-time app.

### Option B: Terminal CLI
```bash
# Run with Google Gemini 2.5 Flash
npm run pipeline -- --topic "Crispy Smash Falafel" --brain gemini

# Run with Backboard AI
npm run pipeline -- --topic "Whipped Feta & Hot Honey" --brain backboard

# Interactive mode
npm run pipeline -- -i
```

---

## 📁 Project Structure

```
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── trends/route.ts      # Live Google Search grounded trends
│   │   │   ├── analyze/route.ts     # Real-time AI Brain analysis
│   │   │   ├── campaign/route.ts    # Ready-to-launch campaign generation
│   │   │   └── fit/route.ts         # Inventory CSV fit matching
│   │   ├── globals.css              # Dark theme & styling
│   │   ├── layout.tsx               # Next.js root layout
│   │   └── page.tsx                 # Real-time Trend Pipeline & CSV Studio
│   ├── components/
│   │   ├── TrendPipeline.tsx        # React 3-stage live pipeline UI
│   │   └── CsvStudio.tsx            # CSV upload & inventory fit matcher
│   ├── lib/
│   │   └── geminiRealtime.ts        # Real-time Gemini Search Grounding
│   └── services/
│       ├── aiBrain.js               # Dual-engine AI Brain client
│       └── trendCollector.js        # Live signal collector
├── scripts/
│   └── trend_pipeline.mjs           # Terminal CLI pipeline
├── next.config.mjs
├── tsconfig.json
├── tailwind.config.ts
└── package.json
```