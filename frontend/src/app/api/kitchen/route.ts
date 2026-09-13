import { NextRequest, NextResponse } from "next/server";
import {
  getServiceClient,
  getUserClient,
  isServerSupabaseConfigured,
  isServiceRoleConfigured,
} from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";

const SELECTS = [
  "id, name, city, state, neighborhood, cuisine_type, restaurant_type, primary_goal, experiment_budget, max_new_ingredients, pride_in, price_band, service_occasions, never_serve, profile_completed_at",
  "id, name, city, state, neighborhood, cuisine_type, pride_in, price_band, service_occasions, never_serve",
  "id, name, city, state, neighborhood, cuisine_type",
  "id, name",
];

function firstRow(data: unknown) {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

function isMissingColumn(message: string | undefined) {
  return /PGRST204|schema cache|column|does not exist/i.test(message || "");
}

async function readKitchen(
  client: ReturnType<typeof getUserClient>,
  ownerId?: string,
) {
  for (const columns of SELECTS) {
    let query = client.from("restaurants").select(columns).limit(1);
    if (ownerId) query = query.eq("owner_id", ownerId);
    const { data, error } = await query;
    if (error && isMissingColumn(error.message)) continue;
    if (error) return { kitchen: null as Record<string, unknown> | null, error: error.message };
    const kitchen = firstRow(data) as Record<string, unknown> | null;
    if (kitchen && (kitchen.id || kitchen.name)) return { kitchen, error: null };
  }
  return { kitchen: null as Record<string, unknown> | null, error: null };
}

export async function GET(req: NextRequest) {
  if (!isServerSupabaseConfigured()) {
    return NextResponse.json({ kitchen: null });
  }

  const authorization = req.headers.get("authorization");
  if (!authorization) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const userClient = getUserClient(authorization);
  const { data: auth, error: authError } = await userClient.auth.getUser(token);
  if (authError || !auth.user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const viaUser = await readKitchen(userClient);
  if (viaUser.kitchen) return NextResponse.json({ kitchen: viaUser.kitchen });

  if (isServiceRoleConfigured()) {
    const viaService = await readKitchen(getServiceClient(), auth.user.id);
    if (viaService.kitchen) return NextResponse.json({ kitchen: viaService.kitchen });
  }

  return NextResponse.json({ kitchen: null });
}
