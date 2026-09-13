import { NextRequest, NextResponse } from "next/server";
import { fetchLiveSocialTrends, fetchMoreDishIdeas, interpretYouTubeDishes, planKitchenSearches, recipesFromNewsArticles, searchWebDishes } from "@miseenvue/agent";
import { loadScrapeDishes, type ScrapedDish } from "@/lib/contracts";
import { hasResearchEvidence, isNearbyDish, rankDiscoverDishes } from "@/lib/discoverFeed";
import { fallbackKitchenQueries } from "@/lib/kitchenSearch";
import { attachClipsToDishes, attachSearchEvidence, dishesFromClips } from "@/lib/liveDiscover";
import { dishesFromNewsRecipes, dishesFromSourceHits, hydrateArticleImages, searchNewsArticles } from "@/lib/newsSearch";
import { searchYouTubeClips } from "@/lib/youtubeSearch";

export const dynamic = "force-dynamic";

type CacheRow = { at: number; dishes: ScrapedDish[]; queries: string[] };
const LIVE_TTL_MS = 20 * 60 * 1000;
const liveCache = new Map<string, CacheRow>();

function kitchenFromRequest(req: NextRequest) {
  const city = req.nextUrl.searchParams.get("city");
  const cuisine = req.nextUrl.searchParams.get("cuisine");
  const neighborhood = req.nextUrl.searchParams.get("neighborhood");
  const state = req.nextUrl.searchParams.get("state");
  const name = req.nextUrl.searchParams.get("name");
  return { city, cuisine, neighborhood, region: state, name };
}

function cacheKey(kitchen: { city?: string | null; cuisine?: string | null; neighborhood?: string | null; region?: string | null }) {
  return ["v21", kitchen.city, kitchen.region, kitchen.cuisine, kitchen.neighborhood]
    .map((part) => (part || "").toLowerCase())
    .join("|");
}

function getFallbackTrendData(query: string, repoDishes: ScrapedDish[]) {
  const matchedDish =
    repoDishes.find(
      (dish) =>
        dish.name?.toLowerCase().includes(query.toLowerCase()) ||
        query.toLowerCase().includes(dish.name?.toLowerCase()),
    ) || repoDishes[0];

  const signals = (matchedDish?.evidence || []).map((item, index) => ({
    id: `${matchedDish?.id || "dish"}-${index}`,
    platform: item.source === "youtube" ? "youtube" : item.source === "google_maps" ? "maps" : "influencer",
    caption: item.excerpt,
    views: item.engagement || 0,
    evidenceUrl: item.url,
    sentiment: item.sentiment || "neutral",
  }));

  return {
    topic: query,
    generatedAt: new Date().toISOString(),
    isRealtime: false,
    summary: matchedDish?.why_trending?.summary || `No live pull for ${query}.`,
    signals,
    groundingSources: (matchedDish?.evidence || [])
      .filter((item) => item.url)
      .map((item) => ({ title: item.excerpt.slice(0, 48), uri: item.url })),
  };
}

async function liveDishes(kitchen: ReturnType<typeof kitchenFromRequest>, fresh: boolean) {
  const key = cacheKey(kitchen);
  const cached = liveCache.get(key);
  if (!fresh && cached && Date.now() - cached.at < LIVE_TTL_MS) {
    return { dishes: cached.dishes, queries: cached.queries, cached: true };
  }
  const planned = await planKitchenSearches({
    city: kitchen.city,
    cuisine: kitchen.cuisine,
    state: kitchen.region,
  }).catch(() => ({ queries: [] as string[], foodWords: [] as string[] }));
  const queries = (
    planned.queries.length
      ? planned.queries
      : fallbackKitchenQueries(kitchen.city, kitchen.cuisine, kitchen.region)
  ).slice(0, 2);
  const [{ clips, note }, webHits, newsArticles] = await Promise.all([
    searchYouTubeClips(queries, 15, { recentOnly: false, city: kitchen.city, state: kitchen.region }),
    searchWebDishes(kitchen.city, kitchen.cuisine).catch(() => []),
    searchNewsArticles(kitchen.city, kitchen.cuisine).catch(() => []),
  ]);
  const [interpreted, newsRecipes] = await Promise.all([
    interpretYouTubeDishes({
      clips,
      city: kitchen.city,
      cuisine: kitchen.cuisine,
    }).catch(() => []),
    recipesFromNewsArticles({
      articles: newsArticles.filter((article) => !/opens?|closing|restaurants? in|now open/i.test(article.title)),
      city: kitchen.city,
      cuisine: kitchen.cuisine,
    }).catch(() => []),
  ]);
  const fromSearch = dishesFromClips(clips, interpreted, kitchen.cuisine);
  const fromWeb = dishesFromSourceHits(webHits);
  const fromNews = dishesFromNewsRecipes(newsRecipes, newsArticles);

  let dishes = rankDiscoverDishes(
    attachSearchEvidence(attachClipsToDishes([...fromSearch, ...fromWeb, ...fromNews], clips)).filter(
      hasResearchEvidence,
    ),
  );
  dishes = await hydrateArticleImages(dishes);

  if (dishes.length) liveCache.set(key, { at: Date.now(), dishes, queries });
  return { dishes, queries, note, cached: false };
}

export async function GET(req: NextRequest) {
  const kitchen = kitchenFromRequest(req);
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  const live = await liveDishes(kitchen, fresh).catch((error) => ({
    dishes: [] as ScrapedDish[],
    queries: [] as string[],
    note: error instanceof Error ? error.message : "Live search failed",
    cached: false,
  }));

  if (live.dishes.length) {
    return NextResponse.json({
      success: true,
      source: "live",
      cached: live.cached,
      queries: live.queries,
      generatedAt: new Date().toISOString(),
      window: { days: 45 },
      sourcesUsed: ["youtube", "google_news", "web"],
      market: {
        city: kitchen.city,
        state: kitchen.region,
        region_name: kitchen.region,
      },
      kitchen: {
        name: kitchen.name,
        city: kitchen.city,
        cuisine: kitchen.cuisine,
      },
      counts: {
        total: live.dishes.length,
        nearby: live.dishes.filter(isNearbyDish).length,
      },
      dishes: live.dishes,
    });
  }

  const fallback = loadScrapeDishes(kitchen);
  if (fallback.dishes.length) {
    return NextResponse.json({
      success: true,
      source: "contract",
      cached: false,
      queries: live.queries,
      generatedAt: new Date().toISOString(),
      window: { days: 45 },
      sourcesUsed: fallback.sourcesUsed.length ? fallback.sourcesUsed : ["youtube", "google_news", "web"],
      market: fallback.market || (kitchen.city ? { city: kitchen.city, state: kitchen.region } : undefined),
      kitchen: {
        name: kitchen.name,
        city: kitchen.city,
        cuisine: kitchen.cuisine,
      },
      counts: {
        total: fallback.dishes.length,
        nearby: fallback.localCount,
      },
      dishes: fallback.dishes,
    });
  }

  return NextResponse.json({
    success: true,
    source: "live",
    cached: false,
    queries: live.queries,
    note: live.note || "No researched videos yet for this kitchen.",
    generatedAt: new Date().toISOString(),
    window: { days: 45 },
    sourcesUsed: ["youtube", "google_news", "web"],
    market: kitchen.city ? { city: kitchen.city, state: kitchen.region } : undefined,
    kitchen: {
      name: kitchen.name,
      city: kitchen.city,
      cuisine: kitchen.cuisine,
    },
    counts: { total: 0, nearby: 0 },
    dishes: [],
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const city = typeof body.city === "string" ? body.city : undefined;
  const repoDishes = loadScrapeDishes(city).dishes;
  const query = body.query || repoDishes[0]?.name || "trending dish";
  const market = {
    city,
    region: typeof body.region === "string" ? body.region : undefined,
  };
  const exclude = Array.isArray(body.exclude)
    ? body.exclude.filter((name: unknown) => typeof name === "string")
    : [];

  if (body.mode === "more") {
    try {
      const ideas = await fetchMoreDishIdeas(market, exclude);
      return NextResponse.json({
        success: true,
        mode: "more",
        isRealtime: true,
        dishes: ideas,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not fetch more dishes";
      return NextResponse.json({
        success: true,
        mode: "more",
        isRealtime: false,
        dishes: [],
        generatedAt: new Date().toISOString(),
        note: message,
      });
    }
  }

  try {
    const realtimeData = await fetchLiveSocialTrends(query, undefined, market);
    return NextResponse.json({
      success: true,
      query,
      isRealtime: true,
      realtimeData,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch trends";
    return NextResponse.json({
      success: true,
      query,
      isRealtime: false,
      realtimeData: getFallbackTrendData(query, repoDishes),
      generatedAt: new Date().toISOString(),
      note: message,
    });
  }
}
