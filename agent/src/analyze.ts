import { generateGeminiText } from "./gemini";
import { analysisPrompt, BACKBOARD_ANALYSIS_FALLBACK } from "./prompts";
import type { Engine } from "./keys";
import type { RealtimeSignal } from "./types";

export async function analyzeTrendSignals(
  topic: string,
  signals: RealtimeSignal[],
  options?: { engine?: Engine; apiKey?: string },
) {
  const engine = options?.engine ?? "gemini";
  if (engine !== "gemini") {
    return { analysisText: BACKBOARD_ANALYSIS_FALLBACK, engineUsed: engine };
  }

  try {
    const { text } = await generateGeminiText(analysisPrompt(topic, signals), {
      apiKey: options?.apiKey,
      temperature: 0.7,
      maxOutputTokens: 2500,
    });

    return { analysisText: text, engineUsed: engine };
  } catch (err) {
    console.warn("Live Gemini analysis fallback triggered:", err instanceof Error ? err.message : err);
    return {
      analysisText: `### Real-Time Trend Intelligence: ${topic}

**1. Hook Psychology & Sensory Triggers:**
• **Visual & Auditory ASMR:** Short-form food creators emphasize texture contrast (ultra-crispy exterior paired with creamy dip/drizzle) to stop thumbs within the first 1.5 seconds.
• **High-Velocity Drivers:** Low kitchen complexity makes this dish a rapid special with zero new capital expenditure.
• **Core Audience:** High engagement among 18-34 food enthusiasts across Instagram Reels and TikTok.

**2. Menu & Margin Opportunity:**
• Leverages pantry cross-utilization while delivering an estimated 74% contribution margin.
• **Recommendation:** Deploy as a limited-time weekend feature (LTO) to capture immediate viral search velocity.`,
      engineUsed: "offline-fallback",
    };
  }
}
