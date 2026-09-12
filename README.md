# MiseEnVue · Social Trend Intelligence & CSV Studio

An end-to-end intelligence engine that **Identifies**, **Analyses**, and **Acts** on viral social trends across **Instagram, TikTok, Facebook, and Influencers**, powered by an AI Brain (Google Gemini 2.5 Flash / Backboard AI), paired with a client-side CSV studio.

---

## 🚀 The 3-Stage Trend Intelligence Pipeline

```
[1. IDENTIFY]           ──▶   [2. ANALYSE]              ──▶   [3. ACT]
Social Signal Ingestion        The AI Brain (Gemini/Backboard)  Campaign Playbook & Execution
• Instagram Reels & Audio      • 3-Second Viral Hook Triggers   • IG Reels 14s Storyboard
• TikTok FYP Sounds & Cuts     • Cross-Platform Dynamics        • TikTok 9s Fast Cut
• Facebook Community Buzz      • Audience Demand & Objections   • Facebook Storytelling Post
• Influencer Reviews & DMs     • Unit Economics & 80%+ Margins  • Creator Collab Outreach DMs
```

### Stage 1: IDENTIFY (Social Signal Aggregator)
- Real-time trend & post collection across 4 distinct channels:
  - **Instagram**: 4K visual plating, cheese pulls, hot honey drizzles, high-engagement Reels, trending sounds.
  - **TikTok**: Short 9s cuts, high-gain mic ASMR crunches, FYP viral sounds, comment-bait tactics.
  - **Facebook**: Local community dining groups, neighborhood discussions, family portion sharing, word-of-mouth trust.
  - **Influencers**: Micro & macro creator profiles, engagement rates, review formats ("Honest 60s Review", "Behind The Line with Chef").
- Pre-built trending topics & custom query search.

### Stage 2: ANALYSE (The AI Brain)
- Powered by **Google Gemini 2.5 Flash** (ultra-fast native) and **Backboard AI** (agentic memory engine).
- Synthesizes raw post signals to extract:
  1. **Viral Hook Psychology**: Why it stops thumbs in 1.5 seconds.
  2. **Cross-Platform Dynamics**: Tailoring for IG vs TikTok vs FB vs Influencer styles.
  3. **Audience Demand**: Commenter questions, cravings, and booking objections.
  4. **Unit Economics & Margin Safeguards**: High-margin attach strategies (e.g. pairing low-food-cost items with high-margin beverages) to protect profitability.

### Stage 3: ACT (Content Strategy & Outreach Engine)
- Generates ready-to-execute production kits:
  - **Instagram Reels**: 3-second hook, shot-by-shot visual storyboard (0-3s, 3-7s, 7-11s, 11-14s), audio styling, copy-paste caption and hashtag stack.
  - **TikTok FYP Cut**: 9-second fast cut, on-screen text-to-speech script, algorithmic comment-bait question.
  - **Facebook Local Post**: Authentic neighborhood storytelling copy with reservation CTAs.
  - **Influencer Collab Brief**: Creator tier criteria, high-reply-rate Instagram DM pitch template, gifting/VIP terms.
- 1-click clipboard copy, Markdown (.md) brief export, and JSON strategy download.

---

## 💻 Headless CLI Pipeline

Run the pipeline directly from the command line:

```bash
# Run with Google Gemini 2.5 Flash
node scripts/trend_pipeline.mjs --topic "Crispy Smash Falafel" --brain gemini

# Run with Backboard AI
node scripts/trend_pipeline.mjs --topic "Whipped Feta & Hot Honey" --brain backboard
```

Generated reports are automatically saved to `reports/trend_strategy_<topic>_<timestamp>.md`.

---

## 📊 CSV Studio

Includes client-side CSV inspection:
- Drag-and-drop or file picker for `.csv` files
- Real-time global search & column sorting
- Section/Summary detection for reports
- Export to JSON & CSV

---

## 🛠️ Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```