import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import type { OpportunityCard, OpportunityStatus } from "@/lib/opportunities";

export async function updateOpportunityStatus(
  opportunityId: string,
  status: OpportunityStatus,
) {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabaseClient()
    .from("opportunities")
    .update({ status })
    .eq("id", opportunityId);

  if (error) throw error;
}

export async function startOpportunityRun(opportunity: OpportunityCard) {
  if (!isSupabaseConfigured()) {
    return opportunity.run?.campaignId ?? "demo-run";
  }
  const supabase = getSupabaseClient();

  if (opportunity.run) {
    await updateOpportunityStatus(opportunity.id, "testing");
    return opportunity.run.campaignId;
  }

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
    ? `${opportunity.dishName}, ${price} — two-week run`
    : `${opportunity.dishName} — two-week run`;

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

  if (campaignError) throw campaignError;

  const { error: experimentError } = await supabase.from("experiments").insert({
    campaign_id: campaign.id,
    restaurant_id: opportunity.restaurantId,
    baseline_start: baselineStart.toISOString(),
    baseline_end: now.toISOString(),
    experiment_start: now.toISOString(),
    experiment_end: end.toISOString(),
    target_metric: "revenue",
    status: "planned",
  });

  if (experimentError) throw experimentError;

  await updateOpportunityStatus(opportunity.id, "testing");
  return campaign.id as string;
}
