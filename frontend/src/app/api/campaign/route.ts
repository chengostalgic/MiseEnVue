import { NextRequest, NextResponse } from "next/server";
import { generateCampaignPlaybook } from "@miseenvue/agent";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { topic, analysisText, engine = "gemini", variation = 0 } = await req.json();
    if (!topic || !analysisText) {
      return NextResponse.json({ error: "Missing topic or analysisText" }, { status: 400 });
    }

    const result = await generateCampaignPlaybook(topic, analysisText, { engine, variation });
    return NextResponse.json({
      success: true,
      topic,
      playbookText: result.playbookText,
      engineUsed: result.engineUsed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Campaign failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
