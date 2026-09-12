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

  const { text } = await generateGeminiText(analysisPrompt(topic, signals), {
    apiKey: options?.apiKey,
    temperature: 0.7,
    maxOutputTokens: 2500,
  });

  return { analysisText: text, engineUsed: engine };
}
