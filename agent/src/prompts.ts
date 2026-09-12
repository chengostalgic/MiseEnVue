import type { RealtimeSignal } from "./types";

export const TREND_SEARCH_PROMPT = (query: string) =>
  `Search live social media trends, viral food videos, and creator posts right now across Instagram Reels, TikTok, Facebook food groups, and food influencers for: "${query}".

Find real, current trending content, view counts, audience comments, and viral audio cues.
Return a STRICT valid JSON object with NO MARKDOWN FENCES (no \`\`\`json) with this exact schema:
{
  "summary": "2-3 sentence overview of why this trend is surging right now with real numbers",
  "signals": [
    {
      "id": "sig-1",
      "platform": "instagram",
      "authorName": "Real creator or publication name",
      "handle": "@handle",
      "authorFollowers": "e.g. 185K",
      "authorType": "Food Creator / Restaurant Reviewer",
      "caption": "Exact or representative caption with hook",
      "hashtags": ["#tag1", "#tag2"],
      "views": 450000,
      "likes": 38000,
      "comments": 920,
      "shares": 11200,
      "engagementRate": "11.2%",
      "trendingAudio": "Audio title or sound",
      "postedTime": "Recent (e.g. 2 days ago)",
      "format": "Reel / 9:16",
      "duration": "12s",
      "hookType": "e.g. 3-Sec ASMR Crunch Snap",
      "sentiment": "94% Positive",
      "badge": "Viral Hit",
      "evidenceUrl": "https://...",
      "topComments": ["Real comment 1", "Real comment 2"]
    }
  ]
}
Include at least 4-6 signals spanning Instagram, TikTok, Facebook, and Influencer reviews.`;

export function analysisPrompt(topic: string, signals: RealtimeSignal[]) {
  const postsSummary = signals
    .map(
      (p) =>
        `[${p.platform.toUpperCase()}] By ${p.authorName} (${p.authorFollowers} followers) | Views: ${p.views?.toLocaleString()} | ER: ${p.engagementRate} | Hook: "${p.hookType}" | Caption: "${p.caption}" | Top Comments: ${p.topComments?.join("; ")}`,
    )
    .join("\n");

  return `You are the Lead Social Media Trend Analyst & AI Strategist for restaurant and hospitality brands.
We have collected the following real-time trend signals across Instagram, TikTok, Facebook, and Influencers for: "${topic}".

REAL-TIME SIGNALS:
${postsSummary}

Perform a rigorous STAGE 2: REAL-TIME TREND ANALYSIS.
Analyze the live data with exact concrete findings. Return with these headings:

### 1. VIRAL HOOK PSYCHOLOGY
Explain why these posts stop thumbs in the first 1.5 seconds. What sensory triggers, curiosity gaps, or status dynamics are driving high completion rates?

### 2. CROSS-PLATFORM BEHAVIORAL DIFFERENCES
- **Instagram Reels**: What format & aesthetic is performing best?
- **TikTok FYP**: What audio cues, pacing, and subcultures are responding?
- **Facebook Local Groups**: How is community trust and family/neighbor dining being signaled?
- **Influencer Collabs**: What review angle generates authentic praise versus paid cynicism?

### 3. AUDIENCE DEMAND & HIGH-INTENT COMMENTS
Summarize the common questions, cravings, and objections diners are expressing.

### 4. UNIT ECONOMICS & MARGIN VIABILITY
How can a local restaurant or business capture this trend with high gross margin (>75%) without discounting?

Do not invent scores, prices, margins, ROI, or unit counts. If you mention economics, keep them qualitative or clearly labeled as examples.`;
}

export function campaignPrompt(topic: string, analysisText: string) {
  return `You are the Lead Creative Director and Campaign Strategist.
Based on this real-time trend analysis for "${topic}":
${analysisText}

Please execute STAGE 3: ACT. Generate production-ready campaign assets for these channels only:
instagram, tiktok, sms, email.

Do not invent numeric scores, prices, margins, or ROI. Restate any numbers already present in the analysis.

### 1. INSTAGRAM
- 3-second hook, shot-by-shot storyboard, caption, hashtags.

### 2. TIKTOK
- 9-second cut, on-screen script, comment-bait question.

### 3. SMS
- Under 160 characters plus opt-out language.

### 4. EMAIL
- Subject, short body, and a creator-outreach variant if useful.

Format everything cleanly with clear headings.`;
}

export const BACKBOARD_ANALYSIS_FALLBACK = `### 1. VIRAL HOOK PSYCHOLOGY
High-contrast plating and a 1-second sensory hook (crunch, drizzle, steam) are what stop the scroll.

### 2. CROSS-PLATFORM BEHAVIORAL DIFFERENCES
- **Instagram**: Saturated, 4K plating with a lo-fi beat.
- **TikTok**: Raw kitchen POV, 9–13 seconds.
- **SMS / email**: Local, specific, and short — not a reel script.

### 3. AUDIENCE DEMAND
Location, wait time, and dietary swaps dominate comments.

### 4. UNIT ECONOMICS
Use the restaurant's scored opportunity for numbers. Do not invent ROI.`;

export const BACKBOARD_CAMPAIGN_FALLBACK = `### 1. INSTAGRAM
Close-up crunch + drizzle. Caption: limited batch, tag a dinner date.

### 2. TIKTOK
"Nobody told me they smash it on cast iron." Comment bait: hot honey vs tahini.

### 3. SMS
Tonight only: the scored special. Reply STOP to opt out.

### 4. EMAIL
Subject: A two-week special we can actually execute. Body: invite a local creator for a complimentary tasting.`;
