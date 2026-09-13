import { NextRequest, NextResponse } from "next/server";
import { loadScrapeDishes, readBudgetContract } from "@/lib/contracts";
import {
  mapOpportunity,
  OPPORTUNITY_SELECT,
  type OpportunityCard,
  type RestaurantSummary,
} from "@/lib/opportunities";
import {
  financeFromBudget,
  pairScrapeToKitchen,
  SCRAPE_SCORING_VERSION,
  type DishPairing,
  type KitchenSnapshot,
} from "@/lib/pairKitchen";
import {
  getServiceClient,
  getUserClient,
  isServerSupabaseConfigured,
  isServiceRoleConfigured,
  type ServerClient,
} from "@/lib/serverSupabase";
import type { Database } from "../../../../../backend/supabase/functions/_shared/db.types";

export const dynamic = "force-dynamic";

type SignalSource = Database["public"]["Enums"]["signal_source"];
type EvidenceType = Database["public"]["Enums"]["evidence_type"];

function asNumber(value: number | string | null | undefined) {
  if (value == null) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function signalSource(source: string): SignalSource {
  if (source === "google_trends") return "google_trends";
  if (source === "google_maps") return "manual";
  if (source === "tiktok") return "tiktok";
  if (source === "instagram") return "instagram";
  if (source === "youtube") return "youtube" as SignalSource;
  return "manual";
}

const RESTAURANT_SELECT =
  "id, name, city, state, neighborhood, cuisine_type, restaurant_type, primary_goal, experiment_budget, max_new_ingredients, pride_in, price_band, service_occasions, never_serve";
const RESTAURANT_SELECT_LEGACY =
  "id, name, city, state, neighborhood, cuisine_type, pride_in, price_band, service_occasions, never_serve";

async function loadKitchen(client: ServerClient, restaurantId: string): Promise<KitchenSnapshot | null> {
  let restaurantRes = await client.from("restaurants").select(RESTAURANT_SELECT).eq("id", restaurantId).maybeSingle();
  if (restaurantRes.error) {
    restaurantRes = await client.from("restaurants").select(RESTAURANT_SELECT_LEGACY).eq("id", restaurantId).maybeSingle();
  }

  const [menuRes, ingredientRes, inventoryRes, salesRes] = await Promise.all([
    client
      .from("menu_items")
      .select("id, name, description, category, tags, price, estimated_cost")
      .eq("restaurant_id", restaurantId)
      .eq("active", true),
    client.from("ingredients").select("id, name").eq("restaurant_id", restaurantId),
    client
      .from("current_inventory")
      .select("ingredient_id, ingredient_name, quantity_on_hand")
      .eq("restaurant_id", restaurantId),
    client
      .from("sales")
      .select("menu_item_id, quantity, sold_at")
      .eq("restaurant_id", restaurantId)
      .gte("sold_at", new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  if (restaurantRes.error || !restaurantRes.data) return null;
  if (menuRes.error) throw menuRes.error;
  if (ingredientRes.error) throw ingredientRes.error;
  if (inventoryRes.error) throw inventoryRes.error;
  if (salesRes.error) throw salesRes.error;

  const row = restaurantRes.data;
  return {
    restaurant: {
      ...row,
      experiment_budget: row.experiment_budget == null ? null : asNumber(row.experiment_budget),
      max_new_ingredients: row.max_new_ingredients == null ? null : Number(row.max_new_ingredients),
    },
    finance: financeFromBudget(readBudgetContract()),
    menuItems: (menuRes.data ?? []).map((item) => ({
      ...item,
      price: asNumber(item.price),
      estimated_cost: item.estimated_cost == null ? null : asNumber(item.estimated_cost),
    })),
    ingredients: ingredientRes.data ?? [],
    inventory: (inventoryRes.data ?? [])
      .filter((row) => row.ingredient_id && row.ingredient_name)
      .map((row) => ({
        ingredient_id: row.ingredient_id as string,
        ingredient_name: row.ingredient_name as string,
        quantity_on_hand: asNumber(row.quantity_on_hand),
      })),
    sales: (salesRes.data ?? []).map((row) => ({
      menu_item_id: row.menu_item_id,
      quantity: row.quantity,
      sold_at: row.sold_at,
    })),
  };
}

async function insertIngestRun(service: ServerClient, fetchedCount: number) {
  const payload = {
    fetched_count: fetchedCount,
    new_count: fetchedCount,
    status: "succeeded" as const,
    finished_at: new Date().toISOString(),
  };

  const youtube = await service.from("ingest_runs").insert({ ...payload, source: "youtube" as SignalSource }).select("id").single();
  if (!youtube.error && youtube.data) return youtube.data.id;

  const fallback = await service.from("ingest_runs").insert({ ...payload, source: "manual" }).select("id").single();
  if (fallback.error) throw fallback.error;
  return fallback.data.id;
}

async function upsertTrend(service: ServerClient, pairing: DishPairing) {
  const { data: existing, error: lookupError } = await service
    .from("trends")
    .select("id")
    .eq("slug", pairing.slug)
    .limit(1)
    .maybeSingle();
  if (lookupError) throw lookupError;

  const fields = {
    name: pairing.dishName,
    slug: pairing.slug,
    description: pairing.description,
    category: "food" as const,
    keywords: pairing.keywords,
    trend_score: pairing.trendScore,
    trend_velocity: pairing.velocity,
    region: null,
    status: pairing.trendStatus,
    last_updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await service.from("trends").update(fields).eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await service.from("trends").insert(fields).select("id").single();
  if (error) throw error;
  return data.id;
}

async function upsertSignals(
  service: ServerClient,
  trendId: string,
  runId: string,
  pairing: DishPairing,
) {
  for (const signal of pairing.signals) {
    const source = signalSource(signal.source);
    const { data: raw, error: rawError } = await service
      .from("raw_signals")
      .upsert(
        {
          source,
          source_id: signal.sourceId,
          ingest_run_id: runId,
          query: pairing.dishName,
          region: pairing.region,
          observed_at: signal.observedAt,
          payload: {
            url: signal.url,
            excerpt: signal.excerpt,
            engagement: signal.engagement,
            original_source: signal.source,
          },
          processed_at: new Date().toISOString(),
        },
        { onConflict: "source,source_id" },
      )
      .select("id")
      .maybeSingle();

    if (rawError) {
      if (source === ("youtube" as SignalSource)) {
        const retry = await service.from("raw_signals").upsert(
          {
            source: "manual",
            source_id: signal.sourceId,
            ingest_run_id: runId,
            query: pairing.dishName,
            region: pairing.region,
            observed_at: signal.observedAt,
            payload: {
              url: signal.url,
              excerpt: signal.excerpt,
              engagement: signal.engagement,
              original_source: signal.source,
            },
            processed_at: new Date().toISOString(),
          },
          { onConflict: "source,source_id" },
        ).select("id").maybeSingle();
        if (retry.error) continue;
        await insertTrendSignal(service, trendId, retry.data?.id ?? null, "manual", signal);
        continue;
      }
      continue;
    }

    await insertTrendSignal(service, trendId, raw?.id ?? null, source, signal);
  }
}

async function insertTrendSignal(
  service: ServerClient,
  trendId: string,
  rawId: string | null,
  source: SignalSource,
  signal: DishPairing["signals"][number],
) {
  if (rawId) {
    const { data: existing } = await service
      .from("trend_signals")
      .select("id")
      .eq("trend_id", trendId)
      .eq("raw_signal_id", rawId)
      .maybeSingle();
    if (existing?.id) return;
  }

  await service.from("trend_signals").insert({
    trend_id: trendId,
    raw_signal_id: rawId,
    source,
    signal_value: signal.signalValue,
    growth_rate: null,
    observed_at: signal.observedAt,
    metadata: { url: signal.url, excerpt: signal.excerpt, engagement: signal.engagement },
  });
}

async function upsertOpportunity(
  service: ServerClient,
  restaurantId: string,
  trendId: string,
  pairing: DishPairing,
) {
  const { data: existing, error: lookupError } = await service
    .from("opportunities")
    .select("id, status")
    .eq("restaurant_id", restaurantId)
    .eq("trend_id", trendId)
    .eq("scoring_version", SCRAPE_SCORING_VERSION)
    .limit(1)
    .maybeSingle();
  if (lookupError) throw lookupError;

  const fields = {
    restaurant_id: restaurantId,
    trend_id: trendId,
    menu_item_id: pairing.menuItemId,
    trend_score: pairing.scores.trend,
    local_relevance_score: pairing.scores.local,
    menu_fit_score: pairing.scores.menuFit,
    operational_fit_score: pairing.scores.operational,
    profitability_score: pairing.scores.profitability,
    overall_score: pairing.scores.overall,
    scoring_version: SCRAPE_SCORING_VERSION,
    suggested_name: pairing.suggestedName,
    suggested_price: pairing.suggestedPrice,
    estimated_cost: pairing.estimatedCost,
    estimated_incremental_revenue: pairing.incrementalRevenue,
    estimated_incremental_profit: pairing.incrementalProfit,
    recommendation: pairing.recommendation,
    missing_ingredients: pairing.missingIngredients,
    analysis: pairing.analysis,
  };

  let opportunityId = existing?.id;
  if (opportunityId) {
    const { error } = await service.from("opportunities").update(fields).eq("id", opportunityId);
    if (error?.message?.includes("analysis")) {
      const { analysis: _analysis, ...legacy } = fields;
      const retry = await service.from("opportunities").update(legacy).eq("id", opportunityId);
      if (retry.error) throw retry.error;
    } else if (error) {
      throw error;
    }
    await service.from("opportunity_evidence").delete().eq("opportunity_id", opportunityId);
  } else {
    const inserted = await service
      .from("opportunities")
      .insert({ ...fields, status: "new" })
      .select("id")
      .single();
    if (inserted.error?.message?.includes("analysis")) {
      const { analysis: _analysis, ...legacy } = fields;
      const retry = await service.from("opportunities").insert({ ...legacy, status: "new" }).select("id").single();
      if (retry.error) throw retry.error;
      opportunityId = retry.data.id;
    } else if (inserted.error) {
      throw inserted.error;
    } else {
      opportunityId = inserted.data.id;
    }
  }

  if (pairing.evidence.length) {
    const { error } = await service.from("opportunity_evidence").insert(
      pairing.evidence.map((item) => ({
        opportunity_id: opportunityId,
        evidence_type: item.evidence_type as EvidenceType,
        source: item.source,
        value: item.value,
        display_value: item.display_value,
        description: item.description,
      })),
    );
    if (error) throw error;
  }

  return opportunityId;
}

async function loadPairedOpportunities(client: ServerClient, restaurantId: string) {
  const query = () =>
    client
      .from("opportunities")
      .select(OPPORTUNITY_SELECT)
      .eq("restaurant_id", restaurantId)
      .eq("scoring_version", SCRAPE_SCORING_VERSION)
      .order("overall_score", { ascending: false });

  const result = await query();
  if (result.error?.message?.includes("analysis")) {
    const retry = await client
      .from("opportunities")
      .select(OPPORTUNITY_SELECT.replace(",\n  analysis", ""))
      .eq("restaurant_id", restaurantId)
      .eq("scoring_version", SCRAPE_SCORING_VERSION)
      .order("overall_score", { ascending: false });
    if (retry.error) throw retry.error;
    return (retry.data ?? []).map((row) => mapOpportunity(row as unknown as Parameters<typeof mapOpportunity>[0]));
  }
  if (result.error) throw result.error;
  return (result.data ?? []).map((row) => mapOpportunity(row as unknown as Parameters<typeof mapOpportunity>[0]));
}

export async function POST(req: NextRequest) {
  if (!isServerSupabaseConfigured()) {
    return NextResponse.json({ success: false, persisted: false, error: "Supabase is not configured." }, { status: 400 });
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization) {
    return NextResponse.json({ success: false, persisted: false, error: "Missing Authorization header." }, { status: 401 });
  }

  const cityHint = req.nextUrl?.searchParams.get("city") ?? undefined;
  let scrape = loadScrapeDishes(cityHint);
  if (!scrape.dishes.length) {
    return NextResponse.json({
      success: false,
      persisted: false,
      error: "No scrape yet. Run: python3 -m ingestion.pipeline --since 14",
    }, { status: 404 });
  }

  try {
    const userClient = getUserClient(authorization);
    const { data: restaurants, error: restaurantError } = await userClient
      .from("restaurants")
      .select("id, name, city, neighborhood")
      .limit(1);
    if (restaurantError) throw restaurantError;

    const restaurant = (restaurants?.[0] ?? null) as RestaurantSummary | null;
    if (!restaurant) {
      return NextResponse.json({ success: false, persisted: false, error: "No restaurant for this account." }, { status: 404 });
    }

    if (!isServiceRoleConfigured()) {
      return NextResponse.json({
        success: true,
        persisted: false,
        reason: "Add SUPABASE_SERVICE_ROLE_KEY to write scrape dishes into trends.",
        restaurant,
        opportunities: [] as OpportunityCard[],
      });
    }

    const service = getServiceClient();
    const kitchen = await loadKitchen(service, restaurant.id);
    if (!kitchen) {
      return NextResponse.json({ success: false, persisted: false, error: "Could not load restaurant state." }, { status: 404 });
    }

    scrape = loadScrapeDishes(kitchen.restaurant.city || restaurant.city || cityHint || undefined);
    const pairings = pairScrapeToKitchen(scrape.dishes, kitchen).slice(0, 8);
    const runId = await insertIngestRun(service, pairings.length);

    for (const pairing of pairings) {
      const trendId = await upsertTrend(service, pairing);
      await upsertSignals(service, trendId, runId, pairing);
      await upsertOpportunity(service, restaurant.id, trendId, pairing);
    }

    const opportunities = await loadPairedOpportunities(userClient, restaurant.id);
    return NextResponse.json({
      success: true,
      persisted: true,
      restaurant,
      count: opportunities.length,
      source: scrape.localCount ? "scrape-local" : "scrape",
      opportunities,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to pair scrape with kitchen";
    return NextResponse.json({ success: false, persisted: false, error: message }, { status: 500 });
  }
}
