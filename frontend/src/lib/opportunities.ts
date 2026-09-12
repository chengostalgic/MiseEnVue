import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

export type OpportunityStatus =
  | "new"
  | "viewed"
  | "accepted"
  | "rejected"
  | "testing"
  | "completed";

export type CampaignAsset = {
  channel: string;
  variant_label: string;
  headline: string | null;
  body: string | null;
  call_to_action: string | null;
};

export type ExperimentResult = {
  baselineValue: number;
  actualValue: number;
  incrementalProfit: number | null;
  roi: number | null;
  confidenceScore: number | null;
  recommendation: string | null;
  computedAt: string;
};

export type OpportunityRun = {
  campaignId: string;
  name: string;
  offer: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  assets: CampaignAsset[];
  experimentStatus: string | null;
  result: ExperimentResult | null;
};

export type OpportunityCard = {
  id: string;
  restaurantId: string;
  dishName: string;
  status: OpportunityStatus;
  recommendation: string | null;
  missingIngredients: string[];
  menuItemName: string | null;
  menuItemPrice: number | null;
  trendName: string | null;
  trendRegion: string | null;
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
  run: OpportunityRun | null;
};

export type RestaurantSummary = {
  id: string;
  name: string;
  city: string | null;
};

type OpportunityRow = {
  id: string;
  restaurant_id: string;
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
  menu_items: { name: string; price: number | string | null } | { name: string; price: number | string | null }[] | null;
  trends: { name: string; region: string | null } | { name: string; region: string | null }[] | null;
  campaigns:
    | Array<{
        id: string;
        name: string;
        offer: string | null;
        start_date: string | null;
        end_date: string | null;
        status: string;
        created_at: string;
        campaign_assets:
          | CampaignAsset[]
          | CampaignAsset
          | null;
        experiments:
          | Array<{
              status: string;
              experiment_results:
                | Array<{
                    baseline_value: number | string;
                    actual_value: number | string;
                    estimated_incremental_profit: number | string | null;
                    roi: number | string | null;
                    confidence_score: number | string | null;
                    recommendation: string | null;
                    computed_at: string;
                  }>
                | {
                    baseline_value: number | string;
                    actual_value: number | string;
                    estimated_incremental_profit: number | string | null;
                    roi: number | string | null;
                    confidence_score: number | string | null;
                    recommendation: string | null;
                    computed_at: string;
                  }
                | null;
            }>
          | null;
      }>
    | null;
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

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function asMany<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function mapRun(row: OpportunityRow): OpportunityRun | null {
  const campaigns = [...asMany(row.campaigns)].sort((a, b) =>
    (b.created_at || "").localeCompare(a.created_at || ""),
  );
  const campaign = campaigns[0];
  if (!campaign) return null;

  const experiment = asMany(campaign.experiments)[0] ?? null;
  const results = asMany(experiment?.experiment_results).sort((a, b) =>
    (b.computed_at || "").localeCompare(a.computed_at || ""),
  );
  const latest = results[0] ?? null;

  return {
    campaignId: campaign.id,
    name: campaign.name,
    offer: campaign.offer,
    startDate: campaign.start_date,
    endDate: campaign.end_date,
    status: campaign.status,
    assets: asMany(campaign.campaign_assets),
    experimentStatus: experiment?.status ?? null,
    result: latest
      ? {
          baselineValue: asNumber(latest.baseline_value) ?? 0,
          actualValue: asNumber(latest.actual_value) ?? 0,
          incrementalProfit: asNumber(latest.estimated_incremental_profit),
          roi: asNumber(latest.roi),
          confidenceScore: asNumber(latest.confidence_score),
          recommendation: latest.recommendation,
          computedAt: latest.computed_at,
        }
      : null,
  };
}

export function mapOpportunity(row: OpportunityRow): OpportunityCard {
  const price = asNumber(row.suggested_price);
  const cost = asNumber(row.estimated_cost);
  const evidence = asMany(row.opportunity_evidence);
  const menuItem = asOne(row.menu_items);
  const trend = asOne(row.trends);

  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    dishName: row.suggested_name || "Untitled opportunity",
    status: row.status as OpportunityStatus,
    recommendation: row.recommendation,
    missingIngredients: row.missing_ingredients || [],
    menuItemName: menuItem?.name ?? null,
    menuItemPrice: asNumber(menuItem?.price),
    trendName: trend?.name ?? null,
    trendRegion: trend?.region ?? null,
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
    run: mapRun(row),
  };
}

export function inboxGroup(status: OpportunityStatus) {
  if (status === "rejected" || status === "completed") return "passed";
  if (status === "accepted" || status === "testing") return "running";
  return "inbox";
}

async function fetchApiOpportunities() {
  const res = await fetch("/api/opportunities");
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.success || !Array.isArray(json.opportunities) || json.opportunities.length === 0) {
    return null;
  }
  return {
    restaurant: { id: "res-local", name: "Local restaurant", city: null } satisfies RestaurantSummary,
    opportunities: json.opportunities as OpportunityCard[],
  };
}

export async function fetchRestaurantOpportunities() {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data: restaurants, error: restaurantError } = await supabase
        .from("restaurants")
        .select("id, name, city")
        .limit(1);

      if (restaurantError) throw restaurantError;
      const restaurant = (restaurants?.[0] as RestaurantSummary | undefined) ?? null;

      const { data, error } = await supabase
        .from("opportunities")
        .select(
          `
          id,
          restaurant_id,
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
          menu_items ( name, price ),
          trends ( name, region ),
          campaigns (
            id,
            name,
            offer,
            start_date,
            end_date,
            status,
            created_at,
            campaign_assets ( channel, variant_label, headline, body, call_to_action ),
            experiments (
              status,
              experiment_results (
                baseline_value,
                actual_value,
                estimated_incremental_profit,
                roi,
                confidence_score,
                recommendation,
                computed_at
              )
            )
          ),
          opportunity_evidence ( evidence_type, source, display_value, description )
        `,
        )
        .order("overall_score", { ascending: false });

      if (!error && data && data.length > 0) {
        return {
          restaurant,
          opportunities: data.map((row) => mapOpportunity(row as OpportunityRow)),
        };
      }
    } catch (err) {
      console.warn("Supabase opportunities fallback:", err);
    }
  }

  const fallback = await fetchApiOpportunities();
  if (fallback) return fallback;

  return { restaurant: null, opportunities: [] };
}
