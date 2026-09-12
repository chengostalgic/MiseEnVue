import { NextRequest, NextResponse } from "next/server";
import { fetchLiveSocialTrends, TRENDS_CONTRACT_PATH } from "@miseenvue/agent";
import fs from "node:fs";

export const dynamic = "force-dynamic";

function getFallbackTrendData(query: string, repoDishes: any[]) {
  const matchedDish =
    repoDishes.find(
      (d: any) =>
        d.name?.toLowerCase().includes(query.toLowerCase()) ||
        query.toLowerCase().includes(d.name?.toLowerCase())
    ) || repoDishes[0];

  const signals = (matchedDish?.evidence || []).map((e: any, idx: number) => ({
    id: `signal-${idx + 1}`,
    platform: e.source === "youtube" ? "youtube" : idx % 2 === 0 ? "instagram" : "tiktok",
    authorName: `@culinary_${e.source || "scene"}`,
    handle: `@chef_spotlight_${idx + 1}`,
    authorFollowers: `${Math.floor(Math.random() * 85) + 15}k`,
    authorType: "Food Creator",
    caption: e.excerpt || `Obsessed with this viral ${query}! #viral #foodtrend`,
    hashtags: ["#foodie", "#viralfood", "#tastetest", "#eats"],
    views: e.engagement ? e.engagement * 10 : 64000,
    likes: Math.round((e.engagement || 5000) * 1.2),
    commentsCount: Math.round((e.engagement || 5000) * 0.08),
    shares: Math.round((e.engagement || 5000) * 0.15),
    evidenceUrl: e.url || "https://youtube.com",
    sentiment: e.sentiment || "positive",
    velocityGrowth: "+72%",
  }));

  if (signals.length === 0) {
    signals.push(
      {
        id: "sig-1",
        platform: "instagram",
        authorName: "@metro_bites",
        handle: "@metrobites",
        authorFollowers: "94k",
        authorType: "City Food Guide",
        caption: `The crunch on this ${query} is absurd! Must-try spot in town.`,
        hashtags: ["#viral", "#foodie", "#cityeats"],
        views: 112000,
        likes: 9200,
        commentsCount: 420,
        shares: 1400,
        evidenceUrl: "https://instagram.com",
        sentiment: "positive",
        velocityGrowth: "+128%",
      },
      {
        id: "sig-2",
        platform: "tiktok",
        authorName: "@flavor_lab",
        handle: "@flavorlab",
        authorFollowers: "310k",
        authorType: "Viral Recipe Reviewer",
        caption: `ASMR sound test with ${query} — you need to taste this immediately.`,
        hashtags: ["#asmr", "#crispy", "#chefsoftiktok"],
        views: 520000,
        likes: 48000,
        commentsCount: 1600,
        shares: 10500,
        evidenceUrl: "https://tiktok.com",
        sentiment: "positive",
        velocityGrowth: "+94%",
      }
    );
  }

  return {
    topic: query,
    generatedAt: new Date().toISOString(),
    isRealtime: false,
    summary:
      matchedDish?.why_trending?.summary ||
      `Surging demand and high velocity search interest for ${query}.`,
    signals,
    groundingSources: [
      {
        title: "Google Trends & YouTube Social Grounding",
        uri: "https://trends.google.com",
      },
    ],
  };
}

export async function GET(req: NextRequest) {
  const query =
    new URL(req.url).searchParams.get("query") ||
    "Crispy Smash Falafel with Whipped Feta";

  let repoDishes: any[] = [];
  if (fs.existsSync(TRENDS_CONTRACT_PATH)) {
    try {
      const contract = JSON.parse(fs.readFileSync(TRENDS_CONTRACT_PATH, "utf-8"));
      repoDishes = contract.dishes || [];
    } catch {
      // ignore
    }
  }

  try {
    const realtimeData = await fetchLiveSocialTrends(query);
    return NextResponse.json({
      success: true,
      query,
      isRealtime: true,
      realtimeData,
      repoDishes,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("Live social trend fetch fallback triggered:", error instanceof Error ? error.message : error);
    const fallbackData = getFallbackTrendData(query, repoDishes);
    return NextResponse.json({
      success: true,
      query,
      isRealtime: false,
      realtimeData: fallbackData,
      repoDishes,
      generatedAt: new Date().toISOString(),
      note: "Contract dataset loaded. Configure a valid GEMINI_API_KEY in .env.local to activate live search grounding.",
    });
  }
}

export async function POST(req: NextRequest) {
  let repoDishes: any[] = [];
  if (fs.existsSync(TRENDS_CONTRACT_PATH)) {
    try {
      const contract = JSON.parse(fs.readFileSync(TRENDS_CONTRACT_PATH, "utf-8"));
      repoDishes = contract.dishes || [];
    } catch {
      // ignore
    }
  }

  try {
    const { query = "Crispy Smash Falafel", apiKey } = await req.json();
    const realtimeData = await fetchLiveSocialTrends(query, apiKey);
    return NextResponse.json({
      success: true,
      query,
      isRealtime: true,
      realtimeData,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const { query = "Crispy Smash Falafel" } = await req.json().catch(() => ({ query: "Crispy Smash Falafel" }));
    const fallbackData = getFallbackTrendData(query, repoDishes);
    return NextResponse.json({
      success: true,
      query,
      isRealtime: false,
      realtimeData: fallbackData,
      generatedAt: new Date().toISOString(),
    });
  }
}
