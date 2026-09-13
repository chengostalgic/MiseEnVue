import { generateAnthropicText } from "./anthropic";
import { generateGeminiText } from "./gemini";
import { hasAnthropicKey } from "./keys";

export async function generateLiveText(
  prompt: string,
  options?: { apiKey?: string; temperature?: number; maxOutputTokens?: number; search?: boolean },
) {
  if (hasAnthropicKey()) {
    const result = await generateAnthropicText(prompt, options);
    return { ...result, engine: "anthropic" as const };
  }

  const result = await generateGeminiText(prompt, options);
  return { ...result, engine: "gemini" as const };
}
