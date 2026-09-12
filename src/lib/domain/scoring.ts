/**
 * Domain Scoring Engine (Architecture §6.4)
 * Pure functions, zero I/O, deterministic arithmetic.
 * 
 * Formula:
 *   overall_score =
 *       0.25 × trend_strength
 *     + 0.15 × local_relevance
 *     + 0.20 × menu_fit
 *     + 0.15 × operational_fit
 *     + 0.25 × profitability
 */

export interface ScoringInputs {
  trendScore: number; // 0-100
  localRelevance?: number; // 0-100 (defaults to 75)
  menuSimilarity: number; // 0-1 (from keyword/tag overlap)
  ingredientOverlapFraction: number; // 0-1 (fraction of required ingredients on-hand)
  proposedMarginPercent: number; // e.g. 78% -> 78
  baselineMarginPercent?: number; // e.g. 68% -> 68
}

export interface ScorecardResult {
  trendStrength: number;
  localRelevance: number;
  menuFit: number;
  operationalFit: number;
  profitability: number;
  overallScore: number;
  scoringVersion: string;
}

export const SCORING_WEIGHTS = {
  TREND_STRENGTH: 0.25,
  LOCAL_RELEVANCE: 0.15,
  MENU_FIT: 0.20,
  OPERATIONAL_FIT: 0.15,
  PROFITABILITY: 0.25,
} as const;

export function computeOpportunityScorecard(inputs: ScoringInputs): ScorecardResult {
  // 1. trend_strength = trend_score as-is (clamped 0-100)
  const trendStrength = Math.min(100, Math.max(0, inputs.trendScore));

  // 2. local_relevance = 0-100 (defaults to 80 for metro area)
  const localRelevance = Math.min(100, Math.max(0, inputs.localRelevance ?? 80));

  // 3. menu_fit = similarity (0-1) * 100
  const menuFit = Math.min(100, Math.max(0, inputs.menuSimilarity * 100));

  // 4. operational_fit = fraction of ingredients on-hand * 100 (fallback 60)
  const operationalFit = inputs.ingredientOverlapFraction !== undefined
    ? Math.min(100, Math.max(0, inputs.ingredientOverlapFraction * 100))
    : 60;

  // 5. profitability = normalized margin score
  // If margin is 80%+, score is near 100; if 60%, score is ~60; if <50%, penalty
  const rawMargin = inputs.proposedMarginPercent || 70;
  const profitability = Math.min(100, Math.max(0, (rawMargin / 85) * 100));

  // Weighted sum (unrounded before final)
  const weighted =
    SCORING_WEIGHTS.TREND_STRENGTH * trendStrength +
    SCORING_WEIGHTS.LOCAL_RELEVANCE * localRelevance +
    SCORING_WEIGHTS.MENU_FIT * menuFit +
    SCORING_WEIGHTS.OPERATIONAL_FIT * operationalFit +
    SCORING_WEIGHTS.PROFITABILITY * profitability;

  // Round once at the end to 2 decimal places per architecture spec
  const overallScore = Math.round(weighted * 100) / 100;

  return {
    trendStrength: Math.round(trendStrength * 100) / 100,
    localRelevance: Math.round(localRelevance * 100) / 100,
    menuFit: Math.round(menuFit * 100) / 100,
    operationalFit: Math.round(operationalFit * 100) / 100,
    profitability: Math.round(profitability * 100) / 100,
    overallScore,
    scoringVersion: "v1.0.0",
  };
}
