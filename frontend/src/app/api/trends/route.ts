import { NextRequest, NextResponse } from "next/server";
import { fetchLiveSocialTrends } from "@miseenvue/agent";
import { readTrendsContract } from "@/lib/contracts";

export const dynamic = "force-dynamic";

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
    const message = error instanceof Error ? error.message : "Failed to fetch trends";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
