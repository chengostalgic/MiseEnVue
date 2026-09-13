import { NextRequest, NextResponse } from "next/server";
import { loadKitchenForToken, saveKitchenForToken } from "@/lib/kitchenPersist";
import { isServerSupabaseConfigured } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";

function bearer(req: NextRequest) {
  return req.headers.get("authorization");
}

export async function GET(req: NextRequest) {
  if (!isServerSupabaseConfigured()) {
    return NextResponse.json({ kitchen: null });
  }

  const authorization = bearer(req);
  if (!authorization) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const result = await loadKitchenForToken(authorization);
  if (result.status === 401) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }
  return NextResponse.json({ kitchen: result.kitchen });
}

export async function POST(req: NextRequest) {
  if (!isServerSupabaseConfigured()) {
    return NextResponse.json({ error: "Kitchen login is not connected on this deploy." }, { status: 503 });
  }

  const authorization = bearer(req);
  if (!authorization) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    city?: string;
    state?: string;
    neighborhood?: string;
    cuisine?: string;
    priceBand?: string;
    occasions?: string[];
    goal?: string;
  } | null;

  if (!body?.name?.trim() || !body.city?.trim() || !body.cuisine?.trim() || !body.state?.trim()) {
    return NextResponse.json({ error: "Name, city, state, and what you cook are required." }, { status: 400 });
  }

  const result = await saveKitchenForToken(authorization, {
    name: body.name,
    city: body.city,
    state: body.state,
    neighborhood: body.neighborhood,
    cuisine: body.cuisine,
    priceBand: body.priceBand,
    occasions: body.occasions,
    goal: body.goal,
  });

  if (result.error || !result.kitchen) {
    return NextResponse.json({ error: result.error || "Could not save the kitchen." }, { status: result.status });
  }
  return NextResponse.json({ kitchen: result.kitchen });
}
