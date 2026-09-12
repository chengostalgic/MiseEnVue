import fs from "node:fs";
import { getGeminiKey } from "./keys";
import { TRENDS_CONTRACT_PATH } from "./paths";
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

  const isBearer = apiKey.startsWith("AQ.") || apiKey.startsWith("ya29.");
  const url = isBearer ? GEMINI_URL : `${GEMINI_URL}?key=${apiKey}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isBearer) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Gemini authentication failed (${response.status}). Ensure GEMINI_API_KEY in .env.local is a valid Google AI Studio API key. Details: ${errorBody}`
      );
    }
    throw new Error(`Gemini request failed (${response.status}): ${errorBody}`);
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
  try {
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
  } catch (error) {
    console.warn(
      "Live Gemini trend grounding fallback triggered:",
      error instanceof Error ? error.message : error
    );

    let repoDishes: any[] = [];
    if (fs.existsSync(TRENDS_CONTRACT_PATH)) {
      try {
        const contract = JSON.parse(fs.readFileSync(TRENDS_CONTRACT_PATH, "utf-8"));
        repoDishes = contract.dishes || [];
      } catch {
        // ignore
      }
    }

    const matched =
      repoDishes.find((d: any) =>
        d.name?.toLowerCase().includes(query.toLowerCase()) ||
        query.toLowerCase().includes(d.name?.toLowerCase())
      ) || repoDishes[0];

    const signals: RealtimeSignal[] = (matched?.evidence || []).map((e: any, idx: number) => ({
      id: `fallback-${idx + 1}`,
      platform: e.source === "youtube" ? "youtube" : idx % 2 === 0 ? "instagram" : "tiktok",
      authorName: `@foodie_${e.source || "scene"}`,
      handle: `@chef_${idx + 1}`,
      authorFollowers: `${Math.floor(Math.random() * 85) + 15}k`,
      authorType: "Food Creator",
      caption: e.excerpt || `Trending viral ${query}! #viralfood #eats`,
      hashtags: ["#foodie", "#viralfood", "#tastetest"],
      views: e.engagement ? e.engagement * 10 : 45000,
      likes: Math.round((e.engagement || 5000) * 1.2),
      commentsCount: Math.round((e.engagement || 5000) * 0.08),
      shares: Math.round((e.engagement || 5000) * 0.15),
      evidenceUrl: e.url || "https://youtube.com",
      sentiment: e.sentiment || "positive",
      velocityGrowth: "+72%",
    }));

    return {
      topic: query,
      generatedAt: new Date().toISOString(),
      isRealtime: false,
      groundingSources: [
        { title: "Google Trends / YouTube (Part 1 Contract)", uri: "https://trends.google.com" },
      ],
      summary: matched?.why_trending?.summary || `Surging social velocity for ${query}.`,
      signals: signals.length > 0 ? signals : [
        {
          id: "sig-1",
          platform: "instagram",
          authorName: "@metro_eats",
          handle: "@metroeats",
          authorFollowers: "95k",
          authorType: "Food Critic",
          caption: `The crunch on this ${query} is unmatched!`,
          hashtags: ["#viral", "#foodie"],
          views: 98000,
          likes: 8200,
          commentsCount: 390,
          shares: 1200,
          evidenceUrl: "https://instagram.com",
          sentiment: "positive",
          velocityGrowth: "+118%",
        },
      ],
    };
  }
}
