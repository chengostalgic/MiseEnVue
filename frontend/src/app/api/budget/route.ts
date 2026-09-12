import { NextResponse } from "next/server";
import { readBudgetContract } from "@/lib/contracts";

export const dynamic = "force-dynamic";

export async function GET() {
  const budget = readBudgetContract();
  if (!budget) {
    return NextResponse.json(
      {
        success: false,
        error: "No budget yet. Run: python -m finance.budget",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, budget });
}
