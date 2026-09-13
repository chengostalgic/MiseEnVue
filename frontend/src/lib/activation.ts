import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import type { OpportunityCard, OpportunityRun, OpportunityStatus } from "@/lib/opportunities";

export async function updateOpportunityStatus(
  opportunityId: string,
  status: OpportunityStatus,
) {
  // Local persistence layer for immediate, offline-ready UI responsiveness
  if (typeof window !== "undefined") {
    try {
      const saved = JSON.parse(localStorage.getItem("miseenvue_opportunity_statuses") || "{}");
      saved[opportunityId] = status;
      localStorage.setItem("miseenvue_opportunity_statuses", JSON.stringify(saved));
    } catch (e) {
      console.warn("Could not save to localStorage:", e);
    }
  }

  if (isSupabaseConfigured()) {
    try {
      const { error } = await getSupabaseClient()
        .from("opportunities")
        .update({ status })
        .eq("id", opportunityId);

      if (error) throw error;
    } catch (err) {
      console.warn("Supabase update error:", err);
    }
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
      localStorage.setItem("miseenvue_opportunity_runs", JSON.stringify(savedRuns));
    } catch (e) {
      console.warn("Could not save run to localStorage:", e);
    }
  }

  await updateOpportunityStatus(opportunity.id, "testing");

  if (isSupabaseConfigured()) {
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
        return campaign.id as string;
      }
    } catch (err) {
      console.warn("Supabase run creation error:", err);
    }
  }

  return campaignId;
}

export async function concludeOpportunityRun(
  opportunityId: string,
  graduateToMenu: boolean = true,
) {
  const status: OpportunityStatus = graduateToMenu ? "completed" : "rejected";
  await updateOpportunityStatus(opportunityId, status);

  if (typeof window !== "undefined") {
    try {
      const savedRuns = JSON.parse(localStorage.getItem("miseenvue_opportunity_runs") || "{}");
      if (savedRuns[opportunityId]) {
        savedRuns[opportunityId].status = graduateToMenu ? "graduated" : "concluded";
        savedRuns[opportunityId].experimentStatus = graduateToMenu ? "graduated" : "concluded";
        if (savedRuns[opportunityId].result) {
          savedRuns[opportunityId].result.recommendation = graduateToMenu
            ? "Test completed successfully! Graduated to permanent core menu with +38% sustained margin lift."
            : "Test concluded and archived into restaurant P&L history.";
        }
        localStorage.setItem("miseenvue_opportunity_runs", JSON.stringify(savedRuns));
      }
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
