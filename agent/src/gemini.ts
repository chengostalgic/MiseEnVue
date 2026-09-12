import { getGeminiKey } from "./keys";
import { TREND_SEARCH_PROMPT } from "./prompts";
import type { RealtimeSignal, RealtimeTrendResult } from "./types";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export async function generateGeminiText(
  prompt: string,
  options?: { apiKey?: string; temperature?: number; maxOutputTokens?: number; search?: boolean },
) {
  const apiKey = getGeminiKey(options?.apiKey);
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: options?.temperature ?? 0.7,
      maxOutputTokens: options?.maxOutputTokens ?? 2500,
    },
  };
  if (options?.search) {
    body.tools = [{ googleSearch: {} }];
  }

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const groundingChunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const groundingSources = groundingChunks
    .map((chunk: { web?: { title?: string; uri?: string } }) => ({
      title: chunk.web?.title || "Web Source",
      uri: chunk.web?.uri || "",
    }))
    .filter((source: { uri: string }) => source.uri);

  return { text, groundingSources, raw: data };
}

export async function fetchLiveSocialTrends(
  query: string,
  apiKey?: string,
): Promise<RealtimeTrendResult> {
  const { text: rawText, groundingSources } = await generateGeminiText(
    TREND_SEARCH_PROMPT(query),
    { apiKey, temperature: 0.3, maxOutputTokens: 3000, search: true },
  );

  let parsed: { summary?: string; signals?: RealtimeSignal[] } | null = null;
  try {
    const cleanJson = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    parsed = JSON.parse(cleanJson);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = null;
      }
    }
  }

  if (!parsed || !Array.isArray(parsed.signals)) {
    return {
      topic: query,
      generatedAt: new Date().toISOString(),
      isRealtime: true,
      groundingSources,
      summary: rawText.slice(0, 300) || `Live social intelligence for ${query}`,
      signals: [],
    };
  }

  return {
    topic: query,
    generatedAt: new Date().toISOString(),
    isRealtime: true,
    groundingSources,
    summary: parsed.summary || `Live real-time social signals for ${query}`,
    signals: parsed.signals.map((signal, idx) => ({
      ...signal,
      id: signal.id || `realtime-${idx + 1}`,
      evidenceUrl:
        signal.evidenceUrl ||
        groundingSources[idx % (groundingSources.length || 1)]?.uri ||
        "",
    })),
  };
}
