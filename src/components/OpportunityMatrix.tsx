"use client";

import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Sparkles,
  ArrowUpRight,
  SlidersHorizontal,
  Flame,
  ShieldAlert,
  Percent,
} from "lucide-react";

interface OpportunityMatrixProps {
  onSelectForCampaign?: (dish: any) => void;
}

export default function OpportunityMatrix({ onSelectForCampaign }: OpportunityMatrixProps) {
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [selectedOpp, setSelectedOpp] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOpportunities();
  }, []);

  async function fetchOpportunities() {
    setLoading(true);
    try {
      const res = await fetch("/api/opportunities");
      const data = await res.json();
      if (data.success && Array.isArray(data.opportunities)) {
        setOpportunities(data.opportunities);
        if (data.opportunities.length > 0) {
          setSelectedOpp(data.opportunities[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch opportunities:", err);
    } finally {
      setLoading(false);
    }
  }

  function getScoreColor(score: number) {
    if (score >= 85) return "text-emerald-400 bg-emerald-950 border-emerald-800";
    if (score >= 70) return "text-cyan-400 bg-cyan-950 border-cyan-800";
    return "text-amber-400 bg-amber-950 border-amber-800";
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-950/80 border border-cyan-800/60 px-2.5 py-0.5 rounded-full">
                Layer 4 Decision Engine
              </span>
              <span className="text-xs text-neutral-400 font-mono">Architecture §6.4 & §6.5</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Opportunity Pairing & Scoring Matrix
            </h2>
            <p className="text-xs sm:text-sm text-neutral-400 mt-1 max-w-2xl">
              Answers the core question: <strong className="text-neutral-200">"Is this specific trend worth acting on for this specific restaurant right now?"</strong>
              Combines external trend signals with inventory fit and deterministic margin arithmetic.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-neutral-400 bg-neutral-950 px-3 py-1.5 rounded-xl border border-neutral-800">
              Scoring Model: <strong className="text-emerald-400">v1.0.0 (5-Factor Weighted)</strong>
            </span>
          </div>
        </div>
      </div>

      {loading && (
        <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-12 text-center space-y-3">
          <div className="w-10 h-10 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mx-auto"></div>
          <p className="text-xs text-neutral-400">Computing 5-factor weighted opportunity scorecards...</p>
        </div>
      )}

      {!loading && opportunities.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Ranked Opportunity List */}
          <div className="lg:col-span-1 space-y-2.5">
            <div className="text-xs font-bold uppercase tracking-wider text-neutral-400 px-1 flex items-center justify-between">
              <span>Ranked Opportunities</span>
              <span className="text-neutral-500 font-mono">{opportunities.length} Total</span>
            </div>

            <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
              {opportunities.map((opp, idx) => (
                <div
                  key={opp.id}
                  onClick={() => setSelectedOpp(opp)}
                  className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                    selectedOpp?.id === opp.id
                      ? "bg-neutral-850 border-cyan-500/80 shadow-lg shadow-cyan-950/40"
                      : "bg-neutral-900/50 hover:bg-neutral-900 border-neutral-800"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-neutral-500">#{idx + 1}</span>
                      <h4 className="text-xs sm:text-sm font-bold text-white truncate">
                        {opp.dishName}
                      </h4>
                    </div>
                    <div className="text-[11px] text-neutral-400 mt-1 flex items-center gap-2">
                      <span>+${opp.economics?.incrementalProfit?.toLocaleString()} profit</span>
                      <span>•</span>
                      <span className="text-emerald-400">{opp.economics?.marginPercent}% margin</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${getScoreColor(opp.scorecard?.overallScore)}`}>
                      {opp.scorecard?.overallScore}
                    </div>
                    <div className="text-[9px] uppercase tracking-wider text-neutral-500 mt-0.5">Score</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Selected Opportunity Detailed Scorecard & Receipts */}
          {selectedOpp && (
            <div className="lg:col-span-2 space-y-5">
              {/* Card Header & 1-Click Launch Button */}
              <div className="bg-neutral-900/70 border border-neutral-800 rounded-xl p-5 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950 px-2.5 py-0.5 rounded-full border border-cyan-800/60">
                      {selectedOpp.scorecard?.overallScore} / 100 Overall Score
                    </span>
                    <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-semibold bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                      {selectedOpp.status === "high_conviction" ? "🔥 High Conviction" : "✓ Qualified Fit"}
                    </span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-extrabold text-white mt-1.5">
                    {selectedOpp.dishName}
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {selectedOpp.whyTrending?.summary}
                  </p>
                </div>

                <button
                  onClick={() => onSelectForCampaign && onSelectForCampaign(selectedOpp)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-neutral-950 font-bold text-xs sm:text-sm transition shadow-lg shadow-emerald-500/20 shrink-0"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Launch 4-Channel Campaign →</span>
                </button>
              </div>

              {/* 5-Component Scorecard Breakdown (§6.4) */}
              <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                    <span>5-Component Scorecard Breakdown (§6.4)</span>
                  </div>
                  <span className="text-[11px] font-mono text-neutral-400">Sum = 0.25·T + 0.15·L + 0.20·M + 0.15·O + 0.25·P</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-center">
                    <div className="text-[10px] text-neutral-400 font-medium">Trend (25%)</div>
                    <div className="text-base font-bold font-mono text-white mt-1">
                      {selectedOpp.scorecard?.trendStrength}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-center">
                    <div className="text-[10px] text-neutral-400 font-medium">Local (15%)</div>
                    <div className="text-base font-bold font-mono text-white mt-1">
                      {selectedOpp.scorecard?.localRelevance}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-center">
                    <div className="text-[10px] text-neutral-400 font-medium">Menu Fit (20%)</div>
                    <div className="text-base font-bold font-mono text-white mt-1">
                      {selectedOpp.scorecard?.menuFit}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-center">
                    <div className="text-[10px] text-neutral-400 font-medium">Ops Fit (15%)</div>
                    <div className="text-base font-bold font-mono text-white mt-1">
                      {selectedOpp.scorecard?.operationalFit}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-center">
                    <div className="text-[10px] text-neutral-400 font-medium">Margin (25%)</div>
                    <div className="text-base font-bold font-mono text-emerald-400 mt-1">
                      {selectedOpp.scorecard?.profitability}
                    </div>
                  </div>
                </div>
              </div>

              {/* Hard Unit Economics Grid (§6.5) */}
              <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-3 shadow-md">
                <div className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Deterministic Unit Economics (§6.5)</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                    <div className="text-[11px] text-neutral-400">Contribution / Plate</div>
                    <div className="text-base font-bold font-mono text-emerald-400 mt-1">
                      ${selectedOpp.economics?.proposedContribution}
                    </div>
                    <div className="text-[10px] text-neutral-500 mt-0.5">
                      +${selectedOpp.economics?.contributionDelta} lift over current
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                    <div className="text-[11px] text-neutral-400">Projected Uplift</div>
                    <div className="text-base font-bold font-mono text-white mt-1">
                      +{selectedOpp.economics?.expectedUpliftPercent}%
                    </div>
                    <div className="text-[10px] text-neutral-500 mt-0.5">
                      {selectedOpp.economics?.expectedUnits} units / 28 days
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                    <div className="text-[11px] text-neutral-400">28-Day Net Profit</div>
                    <div className="text-base font-bold font-mono text-emerald-400 mt-1">
                      +${selectedOpp.economics?.incrementalProfit?.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-neutral-500 mt-0.5">Incremental cash lift</div>
                  </div>

                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                    <div className="text-[11px] text-neutral-400">Projected Ad ROAS</div>
                    <div className="text-base font-bold font-mono text-cyan-400 mt-1">
                      {selectedOpp.economics?.roi}x
                    </div>
                    <div className="text-[10px] text-neutral-500 mt-0.5">On $120 ad budget</div>
                  </div>
                </div>
              </div>

              {/* Evidence Receipts & Negative Theme Safeguards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Evidence Receipts */}
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 space-y-2.5">
                  <div className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Evidence Receipts (Part 1 Contract)</span>
                  </div>
                  <div className="text-xs text-neutral-300 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">7-Day Mention Volume:</span>
                      <span className="font-mono font-bold text-white">{selectedOpp.metrics?.mention_count} posts</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">Total Engagement:</span>
                      <span className="font-mono font-bold text-white">{selectedOpp.metrics?.total_engagement?.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">Audience Sentiment:</span>
                      <span className="font-mono text-emerald-400 font-bold">
                        {Math.round((selectedOpp.metrics?.sentiment?.positive || 0.8) * 100)}% Positive
                      </span>
                    </div>
                  </div>
                </div>

                {/* Negative Theme Safeguard */}
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 space-y-2.5">
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                    <span>Negative Theme Safeguard</span>
                  </div>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    "{selectedOpp.metrics?.negative_theme || "Ensure portion sizes and sauce ratios match customer expectations."}"
                  </p>
                  <div className="text-[11px] text-amber-400/80 font-medium">
                    Action: Used by Stage 3 to proactively counter this objection in ad copy.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
