import { generateGeminiText } from "./gemini";
import { campaignPrompt, BACKBOARD_CAMPAIGN_FALLBACK } from "./prompts";
import type { Engine } from "./keys";

export async function generateCampaignPlaybook(
  topic: string,
  analysisText: string,
  options?: { engine?: Engine; apiKey?: string },
) {
  const engine = options?.engine ?? "gemini";
  if (engine !== "gemini") {
    return { playbookText: BACKBOARD_CAMPAIGN_FALLBACK, engineUsed: engine };
  }

  const { text } = await generateGeminiText(campaignPrompt(topic, analysisText), {
    apiKey: options?.apiKey,
    temperature: 0.7,
    maxOutputTokens: 2500,
  });

  return { playbookText: text, engineUsed: engine };
}
