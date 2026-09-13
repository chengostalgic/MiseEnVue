import { getAnthropicKey } from "./keys";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-5";

export async function generateAnthropicText(
  prompt: string,
  options?: { temperature?: number; maxOutputTokens?: number },
) {
  const apiKey = getAnthropicKey();
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: options?.maxOutputTokens ?? 2500,
      temperature: Math.min(1, options?.temperature ?? 0.7),
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic request failed (${response.status}): ${errorBody.slice(0, 240)}`);
  }

  const data = await response.json();
  const text = (data.content ?? [])
    .filter((part: { type?: string; text?: string }) => part.type === "text" && part.text)
    .map((part: { text: string }) => part.text)
    .join("\n");

  return { text, groundingSources: [] as Array<{ title: string; uri: string }>, raw: data };
}
