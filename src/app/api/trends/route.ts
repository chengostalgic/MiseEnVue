import { NextRequest, NextResponse } from "next/server";
import { fetchLiveSocialTrends } from "@/lib/geminiRealtime";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query") || "Crispy Smash Falafel with Whipped Feta";

  try {
    // 1. Fetch real-time live social trends using Google Gemini Search Grounding
    const realtimeData = await fetchLiveSocialTrends(query);

    // 2. Check if team's Part 1 trends.json exists in data/out/trends.json
    let repoTrends: any = null;
    try {
      const repoTrendsPath = path.resolve(process.cwd(), "data/out/trends.json");
      if (fs.existsSync(repoTrendsPath)) {
        repoTrends = JSON.parse(fs.readFileSync(repoTrendsPath, "utf-8"));
      }
    } catch (e) {
      console.warn("Could not load repo trends.json:", e);
    }

    return NextResponse.json({
      success: true,
      query,
      isRealtime: true,
      realtimeData,
      repoDishes: repoTrends?.dishes || [],
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("Realtime trends error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to fetch real-time trends",
      },
      { status: 500 }
    );
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
  } catch (err: any) {
    console.error("POST trends error:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
