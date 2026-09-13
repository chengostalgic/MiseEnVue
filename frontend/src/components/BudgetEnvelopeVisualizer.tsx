"use client";

import { useState } from "react";
import type { BudgetContract } from "@/lib/contractTypes";
import { money } from "@/lib/format";
import {
  ChevronDown,
  ChevronUp,
  DollarSign,
  Info,
} from "lucide-react";

interface BudgetEnvelopeProps {
  budget: BudgetContract;
  scrapeMeta?: {
    fixture?: boolean;
    sourcesUsed?: string[];
  };
  className?: string;
  defaultExpandedRationale?: boolean;
}

export default function BudgetEnvelopeVisualizer({
  budget,
  scrapeMeta,
  className = "",
  defaultExpandedRationale = false,
}: BudgetEnvelopeProps) {
  const [showRationale, setShowRationale] = useState(defaultExpandedRationale);

  const totalBudget = budget.allocation?.total_budget?.amount ?? 7200;
  const menuTrials = budget.constraints?.max_trial_ingredient_spend ?? 2016;
  const influencerCap = budget.constraints?.max_influencer_fee ?? 1440;
  const paidSocial = budget.constraints?.max_paid_social_spend ?? 3024;
  const capexReserve = budget.constraints?.capex_available ?? 720;
  const healthBand = budget.health?.band ?? "stable";

  // Percentages of total budget
  const menuTrialsPct = Math.round((menuTrials / totalBudget) * 100);
  const paidSocialPct = Math.round((paidSocial / totalBudget) * 100);
  const influencerPct = Math.round((influencerCap / totalBudget) * 100);
  const reservePct = Math.max(0, 100 - menuTrialsPct - paidSocialPct - influencerPct);

  // Financial ratios & metrics
  const foodCostPct = ((budget.ratios?.food_cost_pct ?? 0.3128) * 100).toFixed(1);
  const laborCostPct = ((budget.ratios?.labor_cost_pct ?? 0.3122) * 100).toFixed(1);
  const primeCostPct = ((budget.ratios?.prime_cost_pct ?? 0.625) * 100).toFixed(1);
  const netMarginPct = ((budget.ratios?.net_margin_pct ?? 0.0806) * 100).toFixed(1);
  const currentMonthlySpend = budget.allocation?.current_spend?.current_monthly ?? 3800;
  const breakEvenCovers = budget.allocation?.breakeven?.incremental_covers_per_day ?? 13.3;
  const breakEvenRev = budget.allocation?.breakeven?.incremental_revenue_needed ?? 15212;

  // Scrape sources
  const sources = scrapeMeta?.sourcesUsed?.length
    ? scrapeMeta.sourcesUsed
    : ["Google Places", "YouTube Signals", "Local Dining Pulse"];

  return (
    <section
      aria-label="P&L Budget Envelope"
      className={`rounded-2xl border border-neutral-200/90 bg-white p-5 sm:p-6 shadow-xs select-none transition-all ${className}`}
    >
      {/* HEADER ROW */}
      <div className="pb-4 border-b border-neutral-100">
        <h2 className="text-xl sm:text-2xl font-light tracking-tight text-neutral-950">
          This month’s envelope
        </h2>
        <p className="text-xs text-neutral-500 mt-1 max-w-2xl font-light">
          Calibrated directly from restaurant P&amp;L ({primeCostPct}% prime cost). Dish trials, creator campaigns, and paid social strictly operate within these safe operating limits.
        </p>
      </div>

      {/* BUDGET BOUNDARY & ALLOCATION BREAKDOWN */}
      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between text-xs font-sans text-neutral-500">
          <span className="flex items-center gap-1.5 text-neutral-900 font-medium">
            <DollarSign className="w-3.5 h-3.5 text-[#0047FF]" />
            Total Monthly Boundary: <strong className="text-sm font-semibold tabular-nums">{money(totalBudget)}</strong>
          </span>
          <span className="tabular-nums">4.0% of $180,000 Revenue Benchmark</span>
        </div>

        {/* Allocation breakdown without progress bars */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-neutral-100 font-sans text-[11px]">
          <div className="text-neutral-600">
            <span className="text-neutral-400 block text-[10px] uppercase tracking-wider">Menu Trials</span>
            <span className="text-neutral-950 font-semibold tabular-nums">{money(menuTrials)}</span> ({menuTrialsPct}%)
          </div>
          <div className="text-neutral-600">
            <span className="text-neutral-400 block text-[10px] uppercase tracking-wider">Paid Social</span>
            <span className="text-neutral-950 font-semibold tabular-nums">{money(paidSocial)}</span> ({paidSocialPct}%)
          </div>
          <div className="text-neutral-600">
            <span className="text-neutral-400 block text-[10px] uppercase tracking-wider">Influencers</span>
            <span className="text-neutral-950 font-semibold tabular-nums">{money(influencerCap)}</span> ({influencerPct}%)
          </div>
          <div className="text-neutral-600">
            <span className="text-neutral-400 block text-[10px] uppercase tracking-wider">Kitchen Float</span>
            <span className="text-neutral-950 font-semibold tabular-nums">{money(capexReserve)}</span> ({reservePct}%)
          </div>
        </div>
      </div>

      {/* 4 METRIC TILES (WITHOUT PROGRESS BARS OR BADGES) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mt-5">
        {/* CARD 1: HEALTH */}
        <div className="rounded-xl border border-neutral-200/90 bg-neutral-50/50 p-4 hover:border-neutral-300 transition shadow-2xs flex flex-col justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider font-sans text-neutral-500">
              P&amp;L Health
            </div>
            <div className="mt-2 text-2xl font-medium text-[#0047FF] capitalize flex items-baseline gap-2">
              {healthBand}
              <span className="text-xs font-sans text-neutral-500 font-normal">Band</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-200/70 space-y-1 text-[11px]">
            <div className="flex justify-between text-neutral-600 font-sans">
              <span>Prime Cost:</span>
              <strong className="text-neutral-900 tabular-nums">{primeCostPct}%</strong>
            </div>
            <div className="flex justify-between text-[10px] text-neutral-400 font-sans tabular-nums">
              <span>Target: 60-65%</span>
              <span>Net: {netMarginPct}%</span>
            </div>
          </div>
        </div>

        {/* CARD 2: CAN SPEND */}
        <div className="rounded-xl border border-neutral-200/90 bg-neutral-50/50 p-4 hover:border-neutral-300 transition shadow-2xs flex flex-col justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider font-sans text-neutral-500">
              Total Can Spend
            </div>
            <div className="mt-2 text-2xl font-medium text-[#0047FF] tabular-nums">
              {money(totalBudget)}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-200/70 space-y-1 text-[11px]">
            <div className="flex justify-between text-neutral-600 font-sans">
              <span>Ramping from:</span>
              <span className="text-neutral-900 font-medium tabular-nums">{money(currentMonthlySpend)}/mo</span>
            </div>
            <div className="text-[10px] text-neutral-500 font-sans tabular-nums truncate">
              Breakeven: +{breakEvenCovers} covers/day (${money(breakEvenRev, 0)})
            </div>
          </div>
        </div>

        {/* CARD 3: MENU TRIALS */}
        <div className="rounded-xl border border-neutral-200/90 bg-neutral-50/50 p-4 hover:border-neutral-300 transition shadow-2xs flex flex-col justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider font-sans text-neutral-500">
              Menu Trials Cap
            </div>
            <div className="mt-2 text-2xl font-medium text-[#0047FF] tabular-nums">
              {money(menuTrials)}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-200/70 space-y-1 text-[11px]">
            <div className="flex justify-between text-neutral-600 font-sans">
              <span>Target Dish Margin:</span>
              <strong className="text-neutral-900 font-semibold tabular-nums">≥68%</strong>
            </div>
            <div className="text-[10px] text-neutral-500 font-sans truncate">
              ~$250 test run per prototype plate
            </div>
          </div>
        </div>

        {/* CARD 4: INFLUENCER CAP */}
        <div className="rounded-xl border border-neutral-200/90 bg-neutral-50/50 p-4 hover:border-neutral-300 transition shadow-2xs flex flex-col justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider font-sans text-neutral-500">
              Influencer Cap
            </div>
            <div className="mt-2 text-2xl font-medium text-[#0047FF] tabular-nums">
              {money(influencerCap)}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-200/70 space-y-1 text-[11px]">
            <div className="flex justify-between text-neutral-600 font-sans">
              <span>Geo Targeting:</span>
              <span className="text-neutral-900 font-medium">5-Mile Radius</span>
            </div>
            <div className="text-[10px] text-neutral-500 font-sans truncate">
              ~$360 honorarium per food creator
            </div>
          </div>
        </div>
      </div>

      {/* EXPANDABLE P&L RATIONALE DRAWER */}
      <div className="mt-4 pt-3 border-t border-neutral-100">
        <button
          type="button"
          onClick={() => setShowRationale(!showRationale)}
          className="flex items-center justify-between w-full text-left py-1 text-xs text-neutral-600 hover:text-neutral-900 transition font-sans"
        >
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-[#0047FF]" />
            <span>How was this envelope computed? (P&amp;L Financial Rationale &amp; Breakeven Math)</span>
          </span>
          {showRationale ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
        </button>

        {showRationale && (
          <div className="mt-3 p-4 rounded-xl bg-neutral-50 border border-neutral-200/80 space-y-3 text-xs text-neutral-700 animate-in fade-in duration-200">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-3 border-b border-neutral-200/70 text-center font-sans">
              <div>
                <span className="text-[10px] uppercase text-neutral-400">Food Cost</span>
                <p className="text-sm font-semibold text-[#0047FF] tabular-nums">{foodCostPct}%</p>
              </div>
              <div>
                <span className="text-[10px] uppercase text-neutral-400">Labor Cost</span>
                <p className="text-sm font-semibold text-[#0047FF] tabular-nums">{laborCostPct}%</p>
              </div>
              <div>
                <span className="text-[10px] uppercase text-neutral-400">Prime Cost</span>
                <p className="text-sm font-semibold text-[#0047FF] tabular-nums">{primeCostPct}% (Good)</p>
              </div>
              <div>
                <span className="text-[10px] uppercase text-neutral-400">Net Margin</span>
                <p className="text-sm font-semibold text-[#0047FF] tabular-nums">{netMarginPct}%</p>
              </div>
            </div>

            <div className="space-y-2 font-sans text-neutral-600 leading-relaxed">
              {budget.rationale && budget.rationale.length > 0 ? (
                budget.rationale.map((line, idx) => (
                  <p key={idx} className="flex items-start gap-2">
                    <span className="text-[#0047FF] font-bold mt-0.5">•</span>
                    <span>{line}</span>
                  </p>
                ))
              ) : (
                <>
                  <p className="flex items-start gap-2">
                    <span className="text-[#0047FF] font-bold mt-0.5">•</span>
                    <span>Prime cost is 62.5% of revenue (food 31.3% + labor 31.2%), placing the business squarely in the &lsquo;stable&rsquo; health band.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="text-[#0047FF] font-bold mt-0.5">•</span>
                    <span>Total budget held strictly to the $7,200 benchmark ceiling (4% of $180k monthly sales) to prevent over-stretching kitchen throughput.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="text-[#0047FF] font-bold mt-0.5">•</span>
                    <span>At a 47.3% contribution margin, $7,200 requires $15,212 in incremental revenue to break even — roughly 13.3 extra covers per day at a $38 average check.</span>
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
