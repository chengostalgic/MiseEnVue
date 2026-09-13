import { NextRequest, NextResponse } from "next/server";
import { readTrendsContract } from "@/lib/contracts";
import type { OpportunityCard } from "@/lib/opportunities";

export const dynamic = "force-dynamic";

function computeScorecard(params: {
  trendScore: number;
  localRelevance: number;
  menuFit: number;
  operationalFit: number;
  profitability: number;
}) {
  const overall =
    0.25 * params.trendScore +
    0.15 * params.localRelevance +
    0.2 * params.menuFit +
    0.15 * params.operationalFit +
    0.25 * params.profitability;

  return {
    trendStrength: Math.round(params.trendScore * 10) / 10,
    localRelevance: Math.round(params.localRelevance * 10) / 10,
    menuFit: Math.round(params.menuFit * 10) / 10,
    operationalFit: Math.round(params.operationalFit * 10) / 10,
    profitability: Math.round(params.profitability * 10) / 10,
    overallScore: Math.round(overall * 10) / 10,
  };
}

function computeEconomics(params: {
  suggestedPrice: number;
  estimatedCost: number;
  baselineUnitsPerDay: number;
  trendScore: number;
}) {
  const proposedContribution = params.suggestedPrice - params.estimatedCost;
  const marginPercent = Math.round((proposedContribution / params.suggestedPrice) * 100);
  const days = 28;
  const upliftFactor = Math.min(0.35, Math.max(0.08, (params.trendScore - 50) / 150));
  const expectedUnits = params.baselineUnitsPerDay * days * (1 + upliftFactor);

  return {
    suggestedPrice: params.suggestedPrice,
    estimatedCost: params.estimatedCost,
    proposedContribution: Math.round(proposedContribution * 100) / 100,
    incrementalRevenue: Math.round(expectedUnits * params.suggestedPrice),
    incrementalProfit: Math.round(expectedUnits * proposedContribution),
    marginPercent,
  };
}

function formatEngagement(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M views`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k views`;
  return `${Math.round(value)} views`;
}

export async function GET(_req: NextRequest) {
  try {
    const contract = readTrendsContract();
    const rawDishes = contract?.dishes ?? [];

    const opportunities: OpportunityCard[] = rawDishes.map((dish, index) => {
      const trendScore = Number(dish.trend_score || 0);
      const mentions = dish.metrics?.mention_count ?? dish.evidence?.length ?? 0;
      const localRelevance = Math.max(60, Math.min(95, 70 + mentions * 4));
      const menuFit = Math.max(55, Math.min(94, 88 - index * 3));
      const operationalFit = Math.max(60, Math.min(95, 90 - index * 2));
      const profitability = Math.max(65, Math.min(94, 86 - index * 2));

      const suggestedPrice = 16.5 + (index % 3) * 1.5;
      const estimatedCost = 3.8 + (index % 2) * 0.7;

      const scorecard = computeScorecard({
        trendScore,
        localRelevance,
        menuFit,
        operationalFit,
        profitability,
      });

      const economics = computeEconomics({
        suggestedPrice,
        estimatedCost,
        baselineUnitsPerDay: 18 - (index % 5),
        trendScore,
      });

      const evidenceList = (dish.evidence || []).map((item) => ({
        evidence_type: item.source === "google_trends" ? "trend_growth" : (item.source || "social_signal"),
        source: item.source || "youtube",
        display_value: formatEngagement(item.engagement) ?? (item.engagement ? `${(item.engagement / 1000).toFixed(1)}k engagement` : "+42% spike"),
        description: item.excerpt || "Social media trend velocity signal",
        sentiment: item.sentiment || "neutral",
        engagement: item.engagement != null ? Number(item.engagement) : null,
        url: item.url || null,
      }));

      return {
        id: `opp-${dish.id || index + 1}`,
        restaurantId: "res-local",
        dishName: dish.name,
        status: index === 0 ? "new" : "viewed",
        recommendation: dish.why_trending?.summary || null,
        missingIngredients: [],
        menuItemName: null,
        menuItemPrice: null,
        trendName: dish.name,
        trendRegion: null,
        scorecard,
        economics,
        evidence: evidenceList,
        run: null,
      };
    });

    opportunities.sort((a, b) => b.scorecard.overallScore - a.scorecard.overallScore);

    return NextResponse.json({
      success: true,
      count: opportunities.length,
      opportunities,
      source: contract ? "scrape" : "empty",
      fixture: Boolean(contract?._meta?.fixture || contract?._meta?.hand_written),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load opportunities";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
