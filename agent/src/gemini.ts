import { getGeminiKey } from "./keys";
import { moreDishesPrompt, TREND_SEARCH_PROMPT } from "./prompts";
import type { RealtimeSignal, RealtimeTrendResult } from "./types";

const GEMINI_ENDPOINTS = [
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
  "https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent",
];

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

  // Native generateContent treats Authorization: Bearer as OAuth. API keys
  // (AIza… / AQ.…) must use x-goog-api-key or the gateway returns
  // API_KEY_SERVICE_BLOCKED. Only Google OAuth access tokens use Bearer.
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey.startsWith("ya29.")) {
    headers.Authorization = `Bearer ${apiKey}`;
  } else {
    headers["x-goog-api-key"] = apiKey;
  }

  const payload = JSON.stringify(body);
  const endpoints = apiKey.startsWith("ya29.") ? GEMINI_ENDPOINTS.slice(0, 1) : GEMINI_ENDPOINTS;
  let lastAuthError = "";

  let data: Record<string, any> | null = null;
  for (const url of endpoints) {
    const response = await fetch(url, { method: "POST", headers, body: payload });
    if (response.ok) {
      data = await response.json();
      break;
    }
    const errorBody = await response.text();
    if (response.status === 401 || response.status === 403) {
      lastAuthError = `Gemini authentication failed (${response.status}).`;
      continue;
    }
    throw new Error(`Gemini request failed (${response.status}): ${errorBody.slice(0, 240)}`);
  }

  if (!data) {
    throw new Error(
      lastAuthError ||
        "Gemini authentication failed. GEMINI_API_KEY must be a Google AI Studio key allowed for the Gemini API.",
    );
  }
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
  market?: { city?: string; region?: string },
): Promise<RealtimeTrendResult> {
  try {
    const { text: rawText, groundingSources } = await generateGeminiText(
      TREND_SEARCH_PROMPT(query, market),
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live trend search failed";
    return {
      topic: query,
      generatedAt: new Date().toISOString(),
      isRealtime: false,
      groundingSources: [],
      summary: message,
      signals: [],
    };
  }
}

export type DishIdea = {
  name: string;
  why: string;
  momentum: "rising" | "steady" | "fading";
  ingredients?: string[];
  method?: string[];
};

export async function fetchMoreDishIdeas(
  market?: { city?: string; region?: string },
  exclude: string[] = [],
  apiKey?: string,
): Promise<DishIdea[]> {
  const { text } = await generateGeminiText(moreDishesPrompt(market, exclude), {
    apiKey,
    temperature: 0.85,
    maxOutputTokens: 1600,
    search: true,
  });

  let parsed: {
    dishes?: Array<{ name?: string; why?: string; momentum?: string; ingredients?: unknown; method?: unknown }>;
  } | null = null;
  try {
    const cleanJson = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    parsed = JSON.parse(cleanJson);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = null;
      }
    }
  }

  const dishes = (parsed?.dishes ?? [])
    .map((dish): DishIdea => ({
      name: (dish.name || "").trim(),
      why: (dish.why || "").trim(),
      momentum: dish.momentum === "steady" || dish.momentum === "fading" ? dish.momentum : "rising",
      ingredients: Array.isArray(dish.ingredients)
        ? dish.ingredients.filter((item): item is string => typeof item === "string")
        : undefined,
      method: Array.isArray(dish.method)
        ? dish.method.filter((item): item is string => typeof item === "string")
        : undefined,
    }))
    .filter((dish) => dish.name.length > 1);

  if (dishes.length === 0) {
    throw new Error("Live roster returned no dishes");
  }

  return dishes;
}

export type DishEvidenceHit = {
  name: string;
  sources: Array<{ title: string; url: string; note?: string }>;
};

export async function evidenceForDishes(
  names: string[],
  city?: string | null,
): Promise<DishEvidenceHit[]> {
  const dishes = names.filter((name) => name.trim().length > 1).slice(0, 10);
  if (!dishes.length) return [];
  const place = city ? ` The kitchen is in ${city}.` : "";
  const prompt = `Search the public web for evidence these dishes are getting attention:${place}
${dishes.map((name, i) => `${i + 1}. ${name}`).join("\n")}

Find real URLs only: YouTube watch pages, Google Trends, Eater/Infatuation/news, TikTok, Instagram, or restaurant writeups. Do not invent URLs or use YouTube search-result pages.
Return STRICT JSON with no markdown fences:
{
  "dishes": [
    {
      "name": "Exact dish name from the list",
      "sources": [
        { "title": "Video or page title", "url": "https://...", "note": "e.g. 1.2M views or rising searches" }
      ]
    }
  ]
}`;

  try {
    const { text, groundingSources } = await generateGeminiText(prompt, {
      temperature: 0.2,
      maxOutputTokens: 2000,
      search: true,
    });
    let parsed: { dishes?: Array<{ name?: string; sources?: Array<{ title?: string; url?: string; note?: string }> }> } | null =
      null;
    try {
      parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim());
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    const hits = (parsed?.dishes ?? [])
      .map((dish): DishEvidenceHit => ({
        name: (dish.name || "").trim(),
        sources: (dish.sources ?? [])
          .map((source) => ({
            title: (source.title || "").trim(),
            url: (source.url || "").trim(),
            note: source.note?.trim(),
          }))
          .filter((source) => /^https?:\/\//i.test(source.url)),
      }))
      .filter((dish) => dish.name && dish.sources.length);

    if (!hits.length && groundingSources.length) {
      return dishes.map((name) => ({
        name,
        sources: groundingSources
          .filter((source: { title: string; uri: string }) => source.uri && name.toLowerCase().split(/\s+/).some((word) => word.length > 3 && source.title.toLowerCase().includes(word)))
          .slice(0, 3)
          .map((source: { title: string; uri: string }) => ({ title: source.title, url: source.uri })),
      })).filter((dish: { sources: Array<{ url: string }> }) => dish.sources.length);
    }

    return hits;
  } catch {
    return [];
  }
}

export async function searchWebDishes(
  city?: string | null,
  cuisine?: string | null,
): Promise<Array<{ name: string; description?: string; sources: Array<{ title: string; url: string; note?: string }> }>> {
  const described = cuisine?.trim() || "food a small restaurant would cook";
  const place = city ? ` The kitchen is in ${city}.` : "";
  const prompt = `Search for VIRAL RECIPES people are cooking right now that would fit a kitchen described as "${described}".${place}
The description may be a vibe, fusion, misspelling, or messy phrase — do not require Country + Dish.
Return specific plateable recipes only (e.g. "Baked Feta Pasta", "Steak Frites"). Never return restaurants, openings, closings, or "best restaurants in X".
Prefer YouTube recipe videos and recipe writeups. Skip city dining guides.
Return STRICT JSON with no markdown fences:
{
  "dishes": [
    {
      "name": "Specific recipe name",
      "description": "Why this recipe is spreading",
      "sources": [{ "title": "Page title", "url": "https://...", "note": "views or publication" }]
    }
  ]
}`;

  try {
    const { text, groundingSources } = await generateGeminiText(prompt, {
      temperature: 0.2,
      maxOutputTokens: 2200,
      search: true,
    });
    let parsed: { dishes?: Array<{ name?: string; description?: string; sources?: Array<{ title?: string; url?: string; note?: string }> }> } | null =
      null;
    try {
      parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim());
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    const dishes = (parsed?.dishes ?? [])
      .map((dish) => ({
        name: (dish.name || "").trim(),
        description: dish.description?.trim(),
        sources: (dish.sources ?? [])
          .map((source) => ({
            title: (source.title || "").trim(),
            url: (source.url || "").trim(),
            note: source.note?.trim(),
          }))
          .filter((source) => /^https?:\/\//i.test(source.url) && !/youtube\.com\/results|google\.com\/search/i.test(source.url)),
      }))
      .filter(
        (dish) =>
          dish.name.length > 1 &&
          dish.sources.length &&
          !/\b(restaurants?|opens?|closing|guide to|best \w+ in)\b/i.test(dish.name),
      );

    if (dishes.length) return dishes;
    if (!groundingSources.length) return [];
    return groundingSources
      .slice(0, 6)
      .map((source: { title: string; uri: string }) => ({
        name: source.title.replace(/\s+\||\s+-.*$/, "").slice(0, 80),
        sources: [{ title: source.title, url: source.uri }],
      }))
      .filter(
        (dish: { name: string; sources: Array<{ url: string }> }) =>
          dish.name &&
          dish.sources[0]?.url &&
          !/\b(restaurants?|opens?|closing|guide to|best \w+ in)\b/i.test(dish.name),
      );
  } catch {
    return [];
  }
}
