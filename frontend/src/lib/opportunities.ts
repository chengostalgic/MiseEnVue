import type { ScrapedDish } from "@/lib/contractTypes";
import { isResearchUrl } from "@/lib/discoverFeed";
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
    sentiment?: string | null;
    engagement?: number | null;
    url?: string | null;
    image?: string | null;
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

export function dishKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function dedupeOpportunities(rows: OpportunityCard[]) {
  const seen = new Set<string>();
  const out: OpportunityCard[] = [];
  for (const row of rows) {
    const key = dishKey(row.dishName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function opportunityFromDish(dish: ScrapedDish, index = 0): OpportunityCard {
  const trend = Math.max(0, Math.min(99, Number(dish.trend_score || 0)));
  const mentions = dish.metrics?.mention_count ?? dish.evidence?.length ?? 1;
  const local = dish.metrics?.local_mention_count
    ? Math.min(95, 70 + dish.metrics.local_mention_count * 4)
    : Math.max(55, Math.min(80, 60 + mentions * 3));
  const menuFit = 62;
  const operational = 70;
  const profitability = 68;
  const overall = Math.round((trend * 0.35 + local * 0.15 + menuFit * 0.2 + operational * 0.15 + profitability * 0.15) * 10) / 10;

  return {
    id: `opp-${dish.id || index + 1}`,
    restaurantId: "res-local",
    dishName: dish.name,
    status: "new",
    recommendation:
      dish.recipe?.ingredients.length
        ? `${dish.description || dish.why_trending?.summary || dish.name}. Recipe: ${dish.recipe.ingredients.slice(0, 6).join(", ")}.`
        : dish.description || dish.why_trending?.summary || null,
    missingIngredients: [],
    menuItemName: null,
    menuItemPrice: null,
    trendName: dish.name,
    trendRegion: null,
    scorecard: {
      trendStrength: trend,
      localRelevance: local,
      menuFit,
      operationalFit: operational,
      profitability,
      overallScore: overall,
    },
    economics: {
      suggestedPrice: null,
      estimatedCost: null,
      proposedContribution: null,
      incrementalRevenue: null,
      incrementalProfit: null,
      marginPercent: null,
    },
    evidence: (dish.evidence ?? [])
      .filter((item) => isResearchUrl(item.url))
      .map((item) => ({
        evidence_type: item.source === "youtube" ? "social_signal" : item.source || "social_signal",
        source: item.source || "youtube",
        display_value: item.engagement != null ? String(item.engagement) : item.source === "google_trends" ? "Trends" : null,
        description: item.excerpt,
        sentiment: item.sentiment || null,
        engagement: item.engagement ?? null,
        url: item.url || null,
        image: item.image || null,
      })),
    run: null,
  };
}

export function isProposedOpportunity(row: OpportunityCard) {
  return row.id.startsWith("opp-custom-") || row.trendName === "Chef Proposal";
}

const DEMO_SLUGS = new Set([
  "chapli-kebab-chopped-cheese",
  "hooters-breaded-wings",
  "gnocchi-sausage-vodka-sauce",
  "short-rib-sandwich",
  "scones-strawberry-jam",
  "texas-bbq-brisket",
  "scrapple-sandwich",
  "italian-pastina-soup",
  "soy-glazed-eggplant-rice-bowl",
  "mushroom-risotto",
  "lemon-linguine",
  "apple-bear-claws",
  "chiles-rellenos",
]);

export function isDemoOpportunity(row: OpportunityCard) {
  if (isProposedOpportunity(row)) return false;
  if (/^[a-d]0000000-0000-0000-0000-/.test(row.id)) return true;
  const slug = row.id.replace(/^opp-/, "");
  return DEMO_SLUGS.has(slug);
}

export function hasOpportunityResearch(row: OpportunityCard) {
  if (isDemoOpportunity(row)) return false;
  if (isProposedOpportunity(row)) return true;
  if (inboxGroup(row.status) !== "inbox") return true;
  return row.evidence.some((item) => isResearchUrl(item.url));
}

export function applySavedOpportunityState(rows: OpportunityCard[]): OpportunityCard[] {
  if (typeof window === "undefined") return rows;
  try {
    const savedStatuses = JSON.parse(localStorage.getItem("miseenvue_opportunity_statuses") || "{}") as Record<
      string,
      OpportunityStatus
    >;
    const savedRuns = JSON.parse(localStorage.getItem("miseenvue_opportunity_runs") || "{}") as Record<
      string,
      OpportunityCard["run"]
    >;
    const customOpps = JSON.parse(localStorage.getItem("miseenvue_custom_opportunities") || "[]") as OpportunityCard[];

    const overlay = (row: OpportunityCard): OpportunityCard => {
      const nameKey = `name:${dishKey(row.dishName)}`;
      return {
        ...row,
        status: savedStatuses[row.id] || savedStatuses[nameKey] || row.status,
        run: savedRuns[row.id] !== undefined ? savedRuns[row.id] : savedRuns[nameKey] !== undefined ? savedRuns[nameKey] : row.run,
      };
    };

    const merged = rows.map(overlay);
    const ids = new Set(merged.map((row) => row.id));
    const extras = customOpps
      .filter((row) => !ids.has(row.id) && !merged.some((item) => dishKey(item.dishName) === dishKey(row.dishName)))
      .filter((row) => !isDemoOpportunity(row))
      .map(overlay);
    return dedupeOpportunities([...extras, ...merged].filter((row) => !isDemoOpportunity(row)));
  } catch {
    return rows;
  }
}

export function mergeLiveInbox(live: OpportunityCard[], remote: OpportunityCard[]) {
  const remoteByName = new Map(remote.map((row) => [dishKey(row.dishName), row]));
  const liveKeys = new Set(live.map((row) => dishKey(row.dishName)));

  const inbox = live.map((row) => {
    const prior = remoteByName.get(dishKey(row.dishName));
    if (!prior) return row;
    return {
      ...row,
      status: prior.status,
      run: prior.run,
      menuItemName: prior.menuItemName ?? row.menuItemName,
      menuItemPrice: prior.menuItemPrice ?? row.menuItemPrice,
      economics: prior.economics.incrementalProfit != null ? prior.economics : row.economics,
    };
  });

  const extras = remote.filter((row) => {
    if (isDemoOpportunity(row)) return false;
    if (liveKeys.has(dishKey(row.dishName))) return false;
    return isProposedOpportunity(row);
  });

  return dedupeOpportunities([...inbox, ...extras]);
}

async function fetchApiOpportunities() {
  const res = await fetch("/api/opportunities");
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.success || !Array.isArray(json.opportunities) || json.opportunities.length === 0) {
    return null;
  }

  let opps = json.opportunities as OpportunityCard[];
  if (typeof window !== "undefined") {
    try {
      const customOpps: OpportunityCard[] = JSON.parse(
        localStorage.getItem("miseenvue_custom_opportunities") || "[]",
      );
      if (customOpps.length > 0) {
        opps = [...customOpps, ...opps];
      }
      opps = applySavedOpportunityState(opps);
    } catch (e) {
      console.warn("Could not merge local opportunity storage:", e);
    }
  }

  return {
    restaurant: { id: "res-local", name: "MiseEnVue", city: null } satisfies RestaurantSummary,
    opportunities: opps,
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
