import { NextRequest, NextResponse } from "next/server";
import { fetchLiveSocialTrends, TRENDS_CONTRACT_PATH } from "@miseenvue/agent";
import fs from "node:fs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const query =
    new URL(req.url).searchParams.get("query") ||
    "Crispy Smash Falafel with Whipped Feta";

  try {
    const realtimeData = await fetchLiveSocialTrends(query);
    let repoDishes: unknown[] = [];
    if (fs.existsSync(TRENDS_CONTRACT_PATH)) {
      const contract = JSON.parse(fs.readFileSync(TRENDS_CONTRACT_PATH, "utf-8"));
      repoDishes = contract.dishes || [];
    }

    return NextResponse.json({
      success: true,
      query,
      isRealtime: true,
      realtimeData,
      repoDishes,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch trends";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
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
