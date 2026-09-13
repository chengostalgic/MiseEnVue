import { NextRequest, NextResponse } from "next/server";
import { readTrendsContract } from "@/lib/contracts";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const city = typeof body.city === "string" ? body.city : "";
  if (!city) {
    return NextResponse.json({ success: false, error: "City is required." }, { status: 400 });
  }

  const contract = readTrendsContract();
  if (!contract?.dishes.length) {
    return NextResponse.json({
      success: false,
      error: `No scrape yet. Run: python3 -m ingestion.pipeline --since 14 --city "${city}"`,
    }, { status: 404 });
  }

  const market = contract.market;
  const localDishes = contract.dishes.filter(
    (dish) => (dish.metrics?.by_source?.google_maps ?? 0) > 0 || (dish.metrics?.local_restaurant_count ?? 0) > 0,
  );
  const places = new Set(
    localDishes.flatMap((dish) =>
      (dish.evidence ?? []).filter((item) => item.source === "google_maps").map((item) => item.url),
    ),
  );
  const reviews = localDishes.reduce((sum, dish) => sum + (dish.metrics?.local_mention_count ?? 0), 0);
  const sources = contract.sources_used?.length ? contract.sources_used.join(", ") : "the last scrape";
  const label = market?.city ?? city;

  return NextResponse.json({
    success: true,
    city: market?.city ?? city,
    county: market?.county,
    pin: {
      latitude: market?.latitude,
      longitude: market?.longitude,
      label,
    },
    steps: [
      market?.city
        ? `Last pull pinned ${label}${market.county ? ` · ${market.county}` : ""}`
        : "Last pull had no market pin — dishes are national",
      `${contract.dishes.length} dishes from ${sources}`,
      localDishes.length
        ? `${localDishes.length} dishes have nearby Maps evidence`
        : "No nearby Maps dishes yet — rerun the pipeline with Playwright",
    ],
    places: places.size,
    reviews,
    dishes: localDishes,
  });
}
