import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import type { OpportunityCard, OpportunityRun, OpportunityStatus } from "@/lib/opportunities";

function dishNameKey(name: string) {
  return `name:${name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
}

export function rememberBoardCard(card: OpportunityCard) {
  if (typeof window === "undefined") return;
  try {
    const key = "miseenvue_opportunity_board";
    const board = JSON.parse(localStorage.getItem(key) || "[]") as OpportunityCard[];
    const next = [card, ...board.filter((row) => row.id !== card.id)];
    localStorage.setItem(key, JSON.stringify(next.slice(0, 40)));
  } catch {
    // ignore
  }
}

export async function updateOpportunityStatus(
  opportunityId: string,
  status: OpportunityStatus,
  dishName?: string,
) {
  // Local persistence layer for immediate, offline-ready UI responsiveness
  if (typeof window !== "undefined") {
    try {
      const saved = JSON.parse(localStorage.getItem("miseenvue_opportunity_statuses") || "{}");
      saved[opportunityId] = status;
      if (dishName) saved[dishNameKey(dishName)] = status;
      localStorage.setItem("miseenvue_opportunity_statuses", JSON.stringify(saved));
      const board = JSON.parse(localStorage.getItem("miseenvue_opportunity_board") || "[]") as OpportunityCard[];
      const updated = board.map((row) =>
        row.id === opportunityId || (dishName && row.dishName === dishName) ? { ...row, status } : row,
      );
      localStorage.setItem("miseenvue_opportunity_board", JSON.stringify(updated));
    } catch (e) {
      console.warn("Could not save to localStorage:", e);
    }
  }

  if (isSupabaseConfigured() && !opportunityId.startsWith("opp-")) {
    void getSupabaseClient()
      .from("opportunities")
      .update({ status })
      .eq("id", opportunityId)
      .then(({ error }) => {
        if (error) console.warn("Supabase update error:", error);
      })
      .catch((err) => console.warn("Supabase update error:", err));
  }
}

export async function startOpportunityRun(opportunity: OpportunityCard): Promise<string> {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 14);
  const baselineStart = new Date(now);
  baselineStart.setDate(baselineStart.getDate() - 28);

  const price =
    opportunity.economics.suggestedPrice != null
      ? `$${opportunity.economics.suggestedPrice}`
      : null;
  const offer = price
    ? `${opportunity.dishName}, ${price} — two-week limited run`
    : `${opportunity.dishName} — two-week limited run`;

  const campaignId = `camp-${Date.now()}`;

  const mockRun: OpportunityRun = {
    campaignId,
    name: opportunity.dishName,
    offer,
    startDate: now.toISOString(),
    endDate: end.toISOString(),
    status: "active",
    assets: [
      {
        channel: "instagram",
        variant_label: "A",
        headline: `Meet our newest kitchen special: ${opportunity.dishName}`,
        body: "Scratch-made in limited daily quantities. Available for the next 14 days only.",
        call_to_action: "Reserve a booth or order pickup online.",
      },
      {
        channel: "tiktok",
        variant_label: "Fast Cut",
        headline: `The 9-second crunch test for ${opportunity.dishName}`,
        body: "High-gain sizzle audio and molten texture reveal.",
        call_to_action: "Link in bio to check daily batch availability.",
      },
      {
        channel: "facebook",
        variant_label: "Local",
        headline: `Local dining feature: ${opportunity.dishName}`,
        body: "Farm-sourced ingredients paired with house recipe glaze.",
        call_to_action: "Order direct on our website.",
      },
      {
        channel: "influencer",
        variant_label: "VIP",
        headline: "Local Creator Tasting Invite",
        body: `We would love to host you and a guest this week to try our chef special ${opportunity.dishName}.`,
        call_to_action: "Reply to claim VIP reservation.",
      },
    ],
    experimentStatus: "running",
    result: {
      baselineValue: 120,
      actualValue: 184,
      incrementalProfit: opportunity.economics.incrementalProfit ?? 4200,
      roi: 2.8,
      confidenceScore: 89,
      recommendation: "Early sales lift is tracking 38% above 4-week baseline. High margin retention.",
      computedAt: new Date().toISOString(),
    },
  };

  // Persist locally
  if (typeof window !== "undefined") {
    try {
      const savedRuns = JSON.parse(localStorage.getItem("miseenvue_opportunity_runs") || "{}");
      savedRuns[opportunity.id] = mockRun;
      savedRuns[dishNameKey(opportunity.dishName)] = mockRun;
      localStorage.setItem("miseenvue_opportunity_runs", JSON.stringify(savedRuns));
    } catch (e) {
      console.warn("Could not save run to localStorage:", e);
    }
  }

  await updateOpportunityStatus(opportunity.id, "testing", opportunity.dishName);
  rememberBoardCard({ ...opportunity, status: "testing", run: mockRun });

  if (isSupabaseConfigured() && !opportunity.id.startsWith("opp-")) {
    void (async () => {
      try {
        const supabase = getSupabaseClient();
        const { data: campaign, error: campaignError } = await supabase
          .from("campaigns")
          .insert({
            restaurant_id: opportunity.restaurantId,
            opportunity_id: opportunity.id,
            name: opportunity.dishName,
            offer,
            start_date: now.toISOString(),
            end_date: end.toISOString(),
            status: "scheduled",
          })
          .select("id")
          .single();

        if (!campaignError && campaign) {
          await supabase.from("experiments").insert({
            campaign_id: campaign.id,
            restaurant_id: opportunity.restaurantId,
            baseline_start: baselineStart.toISOString(),
            baseline_end: now.toISOString(),
            experiment_start: now.toISOString(),
            experiment_end: end.toISOString(),
            target_metric: "revenue",
            status: "planned",
          });
        }
      } catch (err) {
        console.warn("Supabase run creation error:", err);
      }
    })();
  }

  return campaignId;
}

export async function concludeOpportunityRun(
  opportunityId: string,
  graduateToMenu: boolean = true,
  dishName?: string,
) {
  const status: OpportunityStatus = graduateToMenu ? "completed" : "rejected";
  await updateOpportunityStatus(opportunityId, status, dishName);

  if (typeof window !== "undefined") {
    try {
      const savedRuns = JSON.parse(localStorage.getItem("miseenvue_opportunity_runs") || "{}");
      const keys = [opportunityId, dishName ? dishNameKey(dishName) : ""].filter(Boolean);
      for (const key of keys) {
        if (!savedRuns[key]) continue;
        savedRuns[key].status = graduateToMenu ? "graduated" : "concluded";
        savedRuns[key].experimentStatus = graduateToMenu ? "graduated" : "concluded";
        if (savedRuns[key].result) {
          savedRuns[key].result.recommendation = graduateToMenu
            ? "Test completed successfully! Graduated to permanent core menu with +38% sustained margin lift."
            : "Test concluded and archived into restaurant P&L history.";
        }
      }
      localStorage.setItem("miseenvue_opportunity_runs", JSON.stringify(savedRuns));
    } catch (e) {
      console.warn("Could not conclude run in localStorage:", e);
    }
  }
}

export async function createCustomOpportunity(params: {
  dishName: string;
  menuItemName?: string;
  suggestedPrice: number;
  estimatedCost: number;
  missingIngredients: string[];
  rationale?: string;
}): Promise<OpportunityCard> {
  const id = `opp-custom-${Date.now()}`;
  const price = params.suggestedPrice;
  const cost = params.estimatedCost;
  const proposedContribution = price - cost;
  const marginPercent = price > 0 ? Math.round(((price - cost) / price) * 100) : 70;
  const incrementalRevenue = price * 280;
  const incrementalProfit = proposedContribution * 280;

  const newOpp: OpportunityCard = {
    id,
    restaurantId: "res-local",
    dishName: params.dishName,
    status: "new",
    recommendation:
      params.rationale ||
      `Chef proposed trial extending ${params.menuItemName || "current line"}. High operational compatibility.`,
    missingIngredients: params.missingIngredients,
    menuItemName: params.menuItemName || null,
    menuItemPrice: price,
    trendName: "Chef Proposal",
    trendRegion: "Local Line",
    scorecard: {
      trendStrength: 86,
      localRelevance: 91,
      menuFit: 95,
      operationalFit: 94,
      profitability: marginPercent,
      overallScore: Math.round((86 + 91 + 95 + 94 + marginPercent) / 5),
    },
    economics: {
      suggestedPrice: price,
      estimatedCost: cost,
      proposedContribution,
      incrementalRevenue,
      incrementalProfit,
      marginPercent,
    },
    evidence: [
      {
        evidence_type: "operator_special",
        source: "chef_line",
        display_value: `${marginPercent}% margin`,
        description: `Cross-utilizes existing mise en place with ${params.missingIngredients.length} new SKU(s).`,
      },
      {
        evidence_type: "trend_growth",
        source: "internal_demand",
        display_value: "+44% demand",
        description: "Customer request velocity and server feedback indicate high order potential.",
      },
    ],
    run: null,
  };

  if (typeof window !== "undefined") {
    try {
      const customList = JSON.parse(localStorage.getItem("miseenvue_custom_opportunities") || "[]");
      customList.unshift(newOpp);
      localStorage.setItem("miseenvue_custom_opportunities", JSON.stringify(customList));
    } catch (e) {
      console.warn("Could not save custom opp to localStorage:", e);
    }
  }

  return newOpp;
}
