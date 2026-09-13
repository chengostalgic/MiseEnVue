import { generateLiveText } from "./generate";
import { campaignPrompt, BACKBOARD_CAMPAIGN_FALLBACK } from "./prompts";
import type { Engine } from "./keys";

export async function generateCampaignPlaybook(
  topic: string,
  analysisText: string,
  options?: { engine?: Engine; apiKey?: string; variation?: number },
) {
  const engine = options?.engine ?? "gemini";
  const variation = options?.variation ?? 0;
  if (engine !== "gemini") {
    return { playbookText: BACKBOARD_CAMPAIGN_FALLBACK, engineUsed: engine };
  }

  try {
    const { text, engine: liveEngine } = await generateLiveText(campaignPrompt(topic, analysisText, variation), {
      apiKey: options?.apiKey,
      temperature: Math.min(1, 0.55 + variation * 0.12),
      maxOutputTokens: 2500,
    });

    return { playbookText: text, engineUsed: liveEngine };
  } catch (err) {
    console.warn("Live Gemini campaign generation fallback triggered:", err instanceof Error ? err.message : err);
    return {
      playbookText: `### 4-Channel Launch Playbook: ${topic}

#### 1. Instagram Reels (Visual ASMR Hook)
• **Visual Hook (0–2s):** Extreme macro shot slicing into ${topic}, revealing molten texture / steam.
• **Audio Pairing:** Trending lo-fi culinary chillhop beat.
• **Caption & Hashtags:**
  "The crunch you've been seeing all over your feed is officially here. 🔥 Smashed to order, finished with house drizzle. Available this weekend only! Tag someone who owes you dinner 👇
  #${topic.replace(/[^a-zA-Z0-9]/g, "")} #FoodieGram #MustEat #[City]Eats #CrunchTest"

#### 2. TikTok 9-Second Fast Cut
• **Cut Sequence:**
  - 0.0s–0.8s: High-gain audio crunch snap.
  - 0.9s–3.5s: Griddle smash & sizzling drizzle pour.
  - 3.6s–6.0s: Taste test reaction.
  - 6.1s–9.0s: "Limited daily batches — link in bio to reserve."

#### 3. Hyper-Local Facebook Community Ad
• **Headline:** Meet our newest kitchen creation: ${topic}.
• **Angle:** Scratch-made with local farm ingredients.
• **Call to Action:** "Book a table or order direct online."

#### 4. Local Foodie Influencer DM Pitch
• "Hey [Name]! Love your local food spots guide. We just introduced a chef's special ${topic} on our menu and would love to host you and a guest for dinner on us this week. Let us know if you'd like us to save you a booth!"`,
      engineUsed: "offline-fallback",
    };
  }
}
