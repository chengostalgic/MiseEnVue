import { NextRequest, NextResponse } from "next/server";
import { fetchLiveSocialTrends } from "@miseenvue/agent";
import { readTrendsContract, type ScrapedDish } from "@/lib/contracts";

export const dynamic = "force-dynamic";

function getFallbackTrendData(query: string, repoDishes: ScrapedDish[]) {
  const matchedDish =
    repoDishes.find(
      (dish) =>
        dish.name?.toLowerCase().includes(query.toLowerCase()) ||
        query.toLowerCase().includes(dish.name?.toLowerCase()),
    ) || repoDishes[0];

  const signals = (matchedDish?.evidence || []).map((item, index) => ({
    id: `${matchedDish?.id || "dish"}-${index}`,
    platform: item.source === "youtube" ? "youtube" : "influencer",
    caption: item.excerpt,
    views: item.engagement || 0,
    evidenceUrl: item.url,
    sentiment: item.sentiment || "neutral",
  }));

  return {
    topic: query,
    generatedAt: new Date().toISOString(),
    isRealtime: false,
    summary: matchedDish?.why_trending?.summary || `No live pull for ${query}.`,
    signals,
    groundingSources: (matchedDish?.evidence || [])
      .filter((item) => item.url)
      .map((item) => ({ title: item.excerpt.slice(0, 48), uri: item.url })),
  };
}

export async function GET() {
  const contract = readTrendsContract();
  if (!contract) {
    return NextResponse.json(
      {
        success: false,
        error: "No scrape contract yet. Run: python -m ingestion.pipeline --offline",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    source: "scrape",
    fixture: Boolean(contract._meta?.fixture || contract._meta?.hand_written),
    generatedAt: contract.generated_at ?? null,
    window: contract.window ?? null,
    sourcesUsed: contract.sources_used ?? [],
    dishes: contract.dishes,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const repoDishes = readTrendsContract()?.dishes ?? [];
  const query = body.query || repoDishes[0]?.name || "trending dish";
  const apiKey = body.apiKey;

  try {
    const realtimeData = await fetchLiveSocialTrends(query, apiKey);
    return NextResponse.json({
      success: true,
      query,
      isRealtime: true,
      realtimeData,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch trends";
    return NextResponse.json({
      success: true,
      query,
      isRealtime: false,
      realtimeData: getFallbackTrendData(query, repoDishes),
      generatedAt: new Date().toISOString(),
      note: message,
    });
  }
}
