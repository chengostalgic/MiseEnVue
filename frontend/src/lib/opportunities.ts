import { getSupabaseClient } from "@/lib/supabase";

export type OpportunityCard = {
  id: string;
  dishName: string;
  status: string;
  recommendation: string | null;
  missingIngredients: string[];
  scorecard: {
    trendStrength: number;
    localRelevance: number;
    menuFit: number;
    operationalFit: number;
    profitability: number;
    overallScore: number;
  };
  economics: {
    suggestedPrice: number | null;
    estimatedCost: number | null;
    proposedContribution: number | null;
    incrementalRevenue: number | null;
    incrementalProfit: number | null;
    marginPercent: number | null;
  };
  evidence: Array<{
    evidence_type: string;
    source: string;
    display_value: string | null;
    description: string;
  }>;
};

type OpportunityRow = {
  id: string;
  suggested_name: string | null;
  status: string;
  recommendation: string | null;
  missing_ingredients: string[] | null;
  trend_score: number;
  local_relevance_score: number;
  menu_fit_score: number;
  operational_fit_score: number;
  profitability_score: number;
  overall_score: number;
  suggested_price: number | null;
  estimated_cost: number | null;
  estimated_incremental_revenue: number | null;
  estimated_incremental_profit: number | null;
  opportunity_evidence:
    | OpportunityCard["evidence"]
    | OpportunityCard["evidence"][number]
    | null;
};

function asNumber(value: number | string | null | undefined) {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapOpportunity(row: OpportunityRow): OpportunityCard {
  const price = asNumber(row.suggested_price);
  const cost = asNumber(row.estimated_cost);
  const evidence = Array.isArray(row.opportunity_evidence)
    ? row.opportunity_evidence
    : row.opportunity_evidence
      ? [row.opportunity_evidence]
      : [];

  return {
    id: row.id,
    dishName: row.suggested_name || "Untitled opportunity",
    status: row.status,
    recommendation: row.recommendation,
    missingIngredients: row.missing_ingredients || [],
    scorecard: {
      trendStrength: Number(row.trend_score),
      localRelevance: Number(row.local_relevance_score),
      menuFit: Number(row.menu_fit_score),
      operationalFit: Number(row.operational_fit_score),
      profitability: Number(row.profitability_score),
      overallScore: Number(row.overall_score),
    },
    economics: {
      suggestedPrice: price,
      estimatedCost: cost,
      proposedContribution: price != null && cost != null ? price - cost : null,
      incrementalRevenue: asNumber(row.estimated_incremental_revenue),
      incrementalProfit: asNumber(row.estimated_incremental_profit),
      marginPercent:
        price != null && cost != null && price > 0
          ? Math.round(((price - cost) / price) * 100)
          : null,
    },
    evidence,
  };
}

export async function fetchRestaurantOpportunities() {
  const supabase = getSupabaseClient();
  const { data: restaurants, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id, name")
    .limit(1);

  if (restaurantError) throw restaurantError;
  const restaurant = restaurants?.[0] ?? null;

  const { data, error } = await supabase
    .from("opportunities")
    .select(
      `
      id,
      suggested_name,
      status,
      recommendation,
      missing_ingredients,
      trend_score,
      local_relevance_score,
      menu_fit_score,
      operational_fit_score,
      profitability_score,
      overall_score,
      suggested_price,
      estimated_cost,
      estimated_incremental_revenue,
      estimated_incremental_profit,
      opportunity_evidence ( evidence_type, source, display_value, description )
    `,
    )
    .order("overall_score", { ascending: false });

  if (error) throw error;

  return {
    restaurant,
    opportunities: (data ?? []).map((row) => mapOpportunity(row as OpportunityRow)),
  };
}
