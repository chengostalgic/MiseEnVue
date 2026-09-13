import { NextResponse } from "next/server";
import { buildSignalLab } from "@/lib/signalLab";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ success: true, lab: buildSignalLab() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load the lab";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
