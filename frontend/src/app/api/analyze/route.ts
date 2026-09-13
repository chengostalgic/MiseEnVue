import { NextRequest, NextResponse } from "next/server";
import { analyzeTrendSignals } from "@miseenvue/agent";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { topic, signals, engine = "gemini", variation = 0 } = await req.json();
    if (!topic || !Array.isArray(signals)) {
      return NextResponse.json({ error: "Missing topic or signals" }, { status: 400 });
    }

    const result = await analyzeTrendSignals(topic, signals, { engine, variation });
    return NextResponse.json({
      success: true,
      topic,
      engineUsed: result.engineUsed,
      analysisText: result.analysisText,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analyze failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
