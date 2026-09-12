/**
 * Domain Economics Engine (Architecture §6.5)
 * Pure arithmetic, no LLM, deterministic financial modeling.
 */

export interface EconomicsInputs {
  baselinePrice: number; // e.g. $16.00
  baselineCost: number; // e.g. $4.80 (30% food cost)
  suggestedPrice: number; // e.g. $18.50
  proposedCost: number; // e.g. $3.70 (20% food cost)
  trendScore: number; // 0-100
  baselineUnitsPerDay?: number; // e.g. 18 units/day
  daysWindow?: number; // e.g. 28 days
  adSpend?: number; // e.g. $150
}

export interface EconomicsResult {
  currentContribution: number;
  proposedContribution: number;
  contributionDelta: number;
  marginPercent: number;
  expectedUpliftPercent: number;
  baselineUnits: number;
  expectedUnits: number;
  incrementalRevenue: number;
  incrementalProfit: number;
  roi: number;
}

export function computeOpportunityEconomics(inputs: EconomicsInputs): EconomicsResult {
  const currentContribution = inputs.baselinePrice - inputs.baselineCost;
  const proposedContribution = inputs.suggestedPrice - inputs.proposedCost;
  const contributionDelta = proposedContribution - currentContribution;
  const marginPercent = Math.round((proposedContribution / inputs.suggestedPrice) * 100);

  // Tunable uplift factor: 0.05 + (trendScore / 100) * 0.20 (5% to 25% lift)
  const upliftFactor = 0.05 + (Math.min(100, Math.max(0, inputs.trendScore)) / 100) * 0.20;
  const expectedUpliftPercent = Math.round(upliftFactor * 100);

  const baselineUnitsPerDay = inputs.baselineUnitsPerDay ?? 15;
  const days = inputs.daysWindow ?? 28;
  const baselineTotalUnits = baselineUnitsPerDay * days;
  const expectedUnits = Math.round(baselineTotalUnits * (1 + upliftFactor));

  // Financial deltas over the window
  const baselineTotalRev = baselineTotalUnits * inputs.baselinePrice;
  const projectedTotalRev = expectedUnits * inputs.suggestedPrice;
  const incrementalRevenue = Math.round((projectedTotalRev - baselineTotalRev) * 100) / 100;

  const baselineTotalProfit = baselineTotalUnits * currentContribution;
  const projectedTotalProfit = expectedUnits * proposedContribution;
  const incrementalProfit = Math.round((projectedTotalProfit - baselineTotalProfit) * 100) / 100;

  const adSpend = inputs.adSpend ?? 120;
  const roi = Math.round((incrementalProfit / Math.max(adSpend, 1)) * 10) / 10;

  return {
    currentContribution: Math.round(currentContribution * 100) / 100,
    proposedContribution: Math.round(proposedContribution * 100) / 100,
    contributionDelta: Math.round(contributionDelta * 100) / 100,
    marginPercent,
    expectedUpliftPercent,
    baselineUnits: baselineTotalUnits,
    expectedUnits,
    incrementalRevenue,
    incrementalProfit,
    roi,
  };
}
