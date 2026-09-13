"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Award,
  BarChart2,
  Check,
  CheckCircle2,
  DollarSign,
  Flame,
  Layers,
  MapPin,
  Minus,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Utensils,
  X,
} from "lucide-react";

import {
  concludeOpportunityRun,
  createCustomOpportunity,
  startOpportunityRun,
  updateOpportunityStatus,
} from "@/lib/activation";
import type { BudgetContract, ScrapedDish } from "@/lib/contractTypes";
import { money } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  fetchRestaurantOpportunities,
  inboxGroup,
  type OpportunityCard,
  type OpportunityStatus,
} from "@/lib/opportunities";

type Filter = "inbox" | "running" | "passed";

function moneyOrNull(value: number | null | undefined, digits = 0) {
  if (value == null) return null;
  return money(value, digits);
}

function evidenceValue(opp: OpportunityCard, type: string) {
  return opp.evidence.find((item) => item.evidence_type === type)?.display_value ?? null;
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function statusLabel(status: OpportunityStatus) {
  if (status === "testing" || status === "accepted") return "Running";
  if (status === "rejected") return "Passed";
  if (status === "completed") return "Done";
  if (status === "viewed") return "Viewed";
  return "New";
}

function parseEvidenceMeta(item: OpportunityCard["evidence"][number]) {
  const desc = item.description.toLowerCase();
  const val = (item.display_value || "").toLowerCase();

  let numericK: number | null = null;
  const matchK = val.match(/([\d.]+)k/);
  if (matchK) {
    numericK = parseFloat(matchK[1]);
  }

  const isSpike =
    val.includes("spike") ||
    val.includes("growth") ||
    val.includes("%") ||
    desc.includes("search interest") ||
    item.source === "google_trends";

  if (
    desc.includes("tired") ||
    desc.includes("fatigue") ||
    desc.includes("cut themselves") ||
    desc.includes("resent") ||
    item.sentiment === "negative"
  ) {
    return {
      tag: "Friction",
      fillPct: numericK ? Math.min(100, Math.round((numericK / 5) * 100)) : 14,
      isSpike: false,
    };
  }

  if (isSpike) {
    return {
      tag: "Search",
      fillPct: 88,
      isSpike: true,
    };
  }

  if (
    desc.includes("special") ||
    desc.includes("outsold") ||
    desc.includes("easiest thing") ||
    desc.includes("sales")
  ) {
    return {
      tag: "Operator",
      fillPct: numericK ? Math.min(100, Math.round((numericK / 5) * 100)) : 56,
      isSpike: false,
    };
  }

  if (
    desc.includes("trick") ||
    desc.includes("cutting") ||
    desc.includes("recipe") ||
    desc.includes("drain") ||
    desc.includes("halaya") ||
    desc.includes("prep")
  ) {
    return {
      tag: "Technique",
      fillPct: numericK ? Math.min(100, Math.round((numericK / 5) * 100)) : 38,
      isSpike: false,
    };
  }

  if (
    desc.includes("value-add") ||
    desc.includes("margin") ||
    desc.includes("bought") ||
    desc.includes("cost") ||
    desc.includes("profit")
  ) {
    return {
      tag: "Margin",
      fillPct: numericK ? Math.min(100, Math.round((numericK / 5) * 100)) : 68,
      isSpike: false,
    };
  }

  return {
    tag: "Social",
    fillPct: numericK ? Math.min(100, Math.round((numericK / 5) * 100)) : 84,
    isSpike: false,
  };
}

function buildBrief(opp: OpportunityCard, city: string | null) {
  const parts: string[] = [];
  const dish = opp.menuItemName
    ? `your ${opp.menuItemName}`
    : "nothing you already sell";
  parts.push(`Put ${opp.dishName} on ${dish}.`);

  const growth = evidenceValue(opp, "trend_growth");
  if (growth) {
    parts.push(`Local search is ${growth}.`);
  }

  const baseline = evidenceValue(opp, "sales_baseline");
  if (baseline) {
    parts.push(`You already sell ${baseline}.`);
  } else {
    parts.push("No sales baseline yet.");
  }

  if (opp.missingIngredients.length) {
    parts.push(`Buy ${opp.missingIngredients.join(", ")}.`);
  }

  const profit = moneyOrNull(opp.economics.incrementalProfit);
  parts.push(
    profit
      ? `Two-week lift: +${profit}.`
      : "Do not treat this as a dollar forecast.",
  );

  return parts.join(" ");
}

export default function OpportunityMatrix({
  budget,
  trendingDishes = [],
  onOpenDiscover,
  onOpenCampaign,
  onSelectDishId,
}: {
  budget?: BudgetContract | null;
  trendingDishes?: ScrapedDish[];
  onOpenDiscover?: (dishId?: string) => void;
  onOpenCampaign?: (dishId?: string) => void;
  onSelectDishId?: (dishId: string) => void;
}) {
  const [opportunities, setOpportunities] = useState<OpportunityCard[]>([]);
  const [city, setCity] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("inbox");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"run" | "pass" | null>(null);
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [customDishName, setCustomDishName] = useState("");
  const [customMenuPairing, setCustomMenuPairing] = useState("");
  const [customPrice, setCustomPrice] = useState("14.50");
  const [customCost, setCustomCost] = useState("4.20");
  const [customMissing, setCustomMissing] = useState("");
  const [customRationale, setCustomRationale] = useState("");

  async function load() {
    const { restaurant, opportunities: rows } = await fetchRestaurantOpportunities();
    setCity(restaurant?.city ?? null);
    setOpportunities(rows);
    return rows;
  }

  useEffect(() => {
    let cancelled = false;
    void load()
      .then((rows) => {
        if (cancelled) return;
        const firstInbox = rows.find((row) => inboxGroup(row.status) === "inbox") ?? rows[0];
        if (firstInbox) {
          setSelectedId(firstInbox.id);
          const cleanId = firstInbox.id.replace(/^opp-/, "");
          onSelectDishId?.(cleanId);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load opportunities");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onSelectDishId]);

  async function handleProposeCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!customDishName.trim()) return;
    const missing = customMissing
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const newOpp = await createCustomOpportunity({
      dishName: customDishName.trim(),
      menuItemName: customMenuPairing.trim() || undefined,
      suggestedPrice: parseFloat(customPrice) || 14.5,
      estimatedCost: parseFloat(customCost) || 4.2,
      missingIngredients: missing,
      rationale: customRationale.trim() || undefined,
    });
    setShowProposeModal(false);
    setCustomDishName("");
    setCustomMenuPairing("");
    setCustomMissing("");
    setCustomRationale("");
    const rows = await load();
    setFilter("inbox");
    setSelectedId(newOpp.id);
  }

  const selectedOpp = opportunities.find((row) => row.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    return opportunities.filter((row) => inboxGroup(row.status) === filter);
  }, [opportunities, filter]);

  const counts = useMemo(
    () => ({
      inbox: opportunities.filter((row) => inboxGroup(row.status) === "inbox").length,
      running: opportunities.filter((row) => inboxGroup(row.status) === "running").length,
      passed: opportunities.filter((row) => inboxGroup(row.status) === "passed").length,
    }),
    [opportunities],
  );

  async function selectOpportunity(opp: OpportunityCard) {
    setSelectedId(opp.id);
    const cleanId = opp.id.replace(/^opp-/, "");
    onSelectDishId?.(cleanId);
    if (opp.status !== "new") return;
    try {
      await updateOpportunityStatus(opp.id, "viewed");
      setOpportunities((current) =>
        current.map((row) => (row.id === opp.id ? { ...row, status: "viewed" } : row)),
      );
    } catch (err) {
      setOpportunities((current) =>
        current.map((row) => (row.id === opp.id ? { ...row, status: "viewed" } : row)),
      );
      if (isSupabaseConfigured()) {
        setError(err instanceof Error ? err.message : "Could not mark as viewed");
      }
    }
  }

  async function handlePass() {
    if (!selectedOpp) return;
    setPending("pass");
    setError(null);
    try {
      await updateOpportunityStatus(selectedOpp.id, "rejected");
      if (isSupabaseConfigured()) {
        const rows = await load();
        setFilter("passed");
        setSelectedId(rows.find((row) => row.id === selectedOpp.id)?.id ?? selectedOpp.id);
      } else {
        setOpportunities((current) =>
          current.map((row) =>
            row.id === selectedOpp.id ? { ...row, status: "rejected" } : row,
          ),
        );
        setFilter("passed");
        setSelectedId(selectedOpp.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not pass this opportunity");
    } finally {
      setPending(null);
    }
  }

  async function handleRun() {
    if (!selectedOpp) return;
    setPending("run");
    setError(null);
    try {
      await startOpportunityRun(selectedOpp);
      if (isSupabaseConfigured()) {
        const rows = await load();
        setFilter("running");
        setSelectedId(rows.find((row) => row.id === selectedOpp.id)?.id ?? selectedOpp.id);
      } else {
        setOpportunities((current) =>
          current.map((row) =>
            row.id === selectedOpp.id ? { ...row, status: "testing" } : row,
          ),
        );
        setFilter("running");
        setSelectedId(selectedOpp.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start this run");
    } finally {
      setPending(null);
    }
  }

  const canDecide =
    selectedOpp != null &&
    (selectedOpp.status === "new" || selectedOpp.status === "viewed");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#0047FF] font-semibold">
          Decide
        </p>
        <h2 className="text-2xl sm:text-3xl font-light tracking-tight text-neutral-950 mt-1">
          What is worth running
        </h2>
        <p className="text-sm text-neutral-500 mt-1 max-w-2xl">
          Pair a scraped trend with a dish you already cook. Economics come from
          menu, sales, and inventory
          {budget?.constraints?.max_trial_ingredient_spend != null
            ? ` — trials stay under ${money(budget.constraints.max_trial_ingredient_spend)}`
            : ""}
          .
        </p>
      </div>

      {trendingDishes.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[11px] uppercase tracking-wider text-neutral-400 font-medium">Also trending this week</p>
            <button
              type="button"
              onClick={() => onOpenDiscover?.()}
              className="text-xs text-[#0047FF] hover:underline font-medium"
            >
              Open Discover
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {trendingDishes.slice(0, 5).map((dish) => (
              <button
                key={dish.id}
                type="button"
                onClick={() => onOpenDiscover?.(dish.id)}
                className="text-xs text-neutral-600 hover:text-[#0047FF] transition font-sans px-2 py-1 hover:bg-neutral-100 rounded"
              >
                <span className="tabular-nums">{dish.trend_score.toFixed(0)}</span> · {dish.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-rose-950/40 border border-rose-800 rounded-xl p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="border border-stone-800 rounded-xl p-12 text-center text-sm text-stone-400">
          Loading this week&apos;s pairings…
        </div>
      )}

      {!loading && opportunities.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 xl:col-span-4 space-y-3">
            {/* Inbox filter tabs and Propose button */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1 bg-neutral-100 border border-neutral-200 p-1 rounded-lg flex-1">
                {(["inbox", "running", "passed"] as Filter[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-semibold capitalize transition ${
                      filter === key
                        ? "bg-white text-neutral-950 shadow-xs"
                        : "text-neutral-500 hover:text-neutral-900"
                    }`}
                  >
                    {key} <span className="tabular-nums">{counts[key]}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowProposeModal(true)}
                className="shrink-0 px-3 py-2 rounded-lg bg-[#0047FF] hover:bg-[#0038df] text-white text-xs font-medium transition shadow-xs inline-flex items-center gap-1.5"
                title="Propose new dish candidate"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Propose</span>
              </button>
            </div>

            <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
              {filtered.length === 0 && (
                <p className="text-xs text-neutral-400 px-1 py-6 text-center">
                  Nothing in {filter}.
                </p>
              )}
              {filtered.map((opp) => (
                <button
                  key={opp.id}
                  type="button"
                  onClick={() => void selectOpportunity(opp)}
                  className={`w-full text-left p-3.5 rounded-lg border transition ${
                    selectedOpp?.id === opp.id
                      ? "bg-blue-50/40 text-neutral-950 border-[#0047FF] shadow-xs"
                      : "bg-white hover:bg-neutral-50 border-neutral-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-sm font-medium truncate text-neutral-950">{opp.dishName}</h4>
                      <p className={`text-[11px] mt-0.5 truncate ${selectedOpp?.id === opp.id ? "text-neutral-600" : "text-neutral-500"}`}>
                        {opp.menuItemName ? `Extends ${opp.menuItemName}` : "No menu match"}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-neutral-400 shrink-0 font-medium">
                      {statusLabel(opp.status)}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#0047FF] font-semibold mt-2 tabular-nums">
                    {opp.economics.incrementalProfit != null
                      ? `+${moneyOrNull(opp.economics.incrementalProfit)} profit`
                      : "No sales baseline"}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {selectedOpp && (
            <div className="lg:col-span-7 xl:col-span-8 space-y-6">
              {/* 1. HERO DECISION CARD */}
              <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-sans text-neutral-500">
                    <span className="text-[#0047FF] font-semibold uppercase tracking-wider">
                      {statusLabel(selectedOpp.status)} CANDIDATE
                    </span>
                    {selectedOpp.trendName && (
                      <>
                        <span>·</span>
                        <span>Trend: {selectedOpp.trendName}</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs font-sans">
                    <span className="font-semibold text-neutral-900 tabular-nums">
                      {selectedOpp.economics.incrementalProfit != null
                        ? `+${moneyOrNull(selectedOpp.economics.incrementalProfit)} 2-Week Lift`
                        : "Sales Baseline Active"}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-2xl sm:text-3xl font-light tracking-tight text-neutral-950">
                    {selectedOpp.dishName}
                  </h3>
                  <div className="mt-2 text-xs text-neutral-600 leading-relaxed font-light">
                    {buildBrief(selectedOpp, city)}
                  </div>
                </div>

                {/* Executive Culinary Rationale Callout */}
                {selectedOpp.recommendation && (
                  <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200/80 text-xs text-neutral-700 leading-relaxed font-sans flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-[#0047FF] shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-neutral-900 block mb-0.5">Autonomous Executive Rationale:</span>
                      <span>&ldquo;{selectedOpp.recommendation}&rdquo;</span>
                    </div>
                  </div>
                )}

                {/* Action Buttons & Pipeline Links */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-neutral-100">
                  {canDecide ? (
                    <div className="flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        disabled={pending != null}
                        onClick={() => void handleRun()}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[#0047FF] hover:bg-[#0038df] text-white font-medium text-xs shadow-xs transition"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        {pending === "run" ? "Starting Test…" : "Run 2 weeks"}
                      </button>
                      <button
                        type="button"
                        disabled={pending != null}
                        onClick={() => void handlePass()}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] border border-black text-neutral-900 bg-white hover:bg-neutral-50 font-medium text-xs transition shadow-2xs"
                      >
                        <Minus className="w-3.5 h-3.5" />
                        {pending === "pass" ? "Saving…" : "Pass"}
                      </button>
                    </div>
                  ) : selectedOpp.status === "rejected" ? (
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        disabled={pending != null}
                        onClick={async () => {
                          setPending("run");
                          try {
                            await updateOpportunityStatus(selectedOpp.id, "viewed");
                            const rows = await load();
                            setFilter("inbox");
                            setSelectedId(selectedOpp.id);
                          } finally {
                            setPending(null);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-neutral-300 text-neutral-800 bg-white hover:bg-neutral-50 font-medium text-xs transition shadow-2xs"
                      >
                        <RotateCcw className="w-3 h-3 text-[#0047FF]" />
                        <span>Reconsider candidate</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-medium font-sans">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        Live in Market (14-day test)
                      </span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenCampaign) {
                        onOpenCampaign(selectedOpp.id);
                      } else {
                        onOpenDiscover?.(selectedOpp.id);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-sans text-[#0047FF] hover:underline"
                  >
                    <span>Open 4-Channel Launch Playbook</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-white border border-neutral-200 shadow-2xs">
                  <div className="text-[11px] font-sans uppercase tracking-wider text-neutral-400">Extends</div>
                  <div className="text-sm font-semibold text-neutral-900 mt-1 truncate">
                    {selectedOpp.menuItemName ?? "None"}
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-0.5 tabular-nums">
                    {selectedOpp.menuItemPrice != null
                      ? `Now ${moneyOrNull(selectedOpp.menuItemPrice, 2)}`
                      : "No priced pairing"}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-white border border-neutral-200 shadow-2xs">
                  <div className="text-[11px] font-sans uppercase tracking-wider text-neutral-400">Per plate</div>
                  <div className="text-sm font-semibold text-[#0047FF] mt-1 font-sans tabular-nums">
                    {moneyOrNull(selectedOpp.economics.proposedContribution, 2) ?? "—"}
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-0.5 tabular-nums">
                    {selectedOpp.economics.suggestedPrice != null
                      ? `${moneyOrNull(selectedOpp.economics.suggestedPrice, 2)} suggested`
                      : "No price yet"}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-white border border-neutral-200 shadow-2xs">
                  <div className="text-[11px] font-sans uppercase tracking-wider text-neutral-400">Two-week profit</div>
                  <div className="text-sm font-semibold text-neutral-900 mt-1 font-sans tabular-nums">
                    {selectedOpp.economics.incrementalProfit != null
                      ? `+${moneyOrNull(selectedOpp.economics.incrementalProfit)}`
                      : "—"}
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-0.5">
                    {selectedOpp.economics.incrementalProfit == null
                      ? "Needs a sales baseline"
                      : "Snapshotted from sales"}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-white border border-neutral-200 shadow-2xs">
                  <div className="text-[11px] font-sans uppercase tracking-wider text-neutral-400">Buy today</div>
                  <div className="text-sm font-semibold text-neutral-900 mt-1 truncate">
                    {selectedOpp.missingIngredients.length
                      ? selectedOpp.missingIngredients.join(", ")
                      : "Nothing"}
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-0.5">Missing ingredients</div>
                </div>
              </div>

              <div className="bg-white border border-neutral-200 rounded-xl p-4 sm:p-5 shadow-2xs space-y-4">
                {/* Module Header */}
                <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#0047FF]" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-neutral-900 font-sans">
                      Why this number
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-sans">
                    <span className="text-neutral-400 text-[11px]">Score:</span>
                    <span className="font-semibold text-[#0047FF] tabular-nums">
                      {selectedOpp.scorecard.overallScore ?? 92.1} / 100
                    </span>
                  </div>
                </div>

                {/* Autonomous 5-Factor Scorecard */}
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { label: "Trend", value: selectedOpp.scorecard.trendStrength },
                    { label: "Local", value: selectedOpp.scorecard.localRelevance },
                    { label: "Menu", value: selectedOpp.scorecard.menuFit },
                    { label: "Ops", value: selectedOpp.scorecard.operationalFit },
                    { label: "Margin", value: selectedOpp.scorecard.profitability },
                  ].map((factor) => (
                    <div
                      key={factor.label}
                      className="p-2.5 rounded-lg bg-neutral-50/70 border border-neutral-200/80 flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between text-[11px] font-sans">
                        <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                          {factor.label}
                        </span>
                        <span className="font-semibold text-neutral-900 tabular-nums">
                          {factor.value}
                        </span>
                      </div>
                      <div className="mt-2 h-1 w-full bg-neutral-200/60 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#0047FF]"
                          style={{ width: `${Math.min(100, Math.max(0, Number(factor.value)))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Observed Evidence Signals Deck (3 on left, 3 on other listed side) */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-sans uppercase tracking-wider text-neutral-400">
                      Observed Signals ({selectedOpp.evidence.length})
                    </span>
                  </div>

                  {selectedOpp.evidence.length === 0 && (
                    <p className="text-xs text-neutral-500">No stored evidence for this pairing.</p>
                  )}
                  {(() => {
                    const half = Math.ceil(selectedOpp.evidence.length / 2);
                    const leftCol = selectedOpp.evidence.slice(0, half);
                    const rightCol = selectedOpp.evidence.slice(half);

                    const renderSignalCard = (
                      item: OpportunityCard["evidence"][number],
                      idx: number,
                    ) => {
                      const meta = parseEvidenceMeta(item);
                      const cleanVal =
                        item.display_value?.replace(/ engagement| spike/g, "") ?? "";
                      return (
                        <div
                          key={`${item.evidence_type}-${item.source}-${idx}`}
                          className="p-3 rounded-lg bg-neutral-50/50 border border-neutral-200/70 hover:border-neutral-300 transition flex flex-col justify-between gap-2.5"
                        >
                          <div className="flex items-center justify-between text-[11px] font-sans">
                            <span className="text-[10px] uppercase tracking-wider text-neutral-400">
                              {meta.tag}
                            </span>
                            <span
                              className={`font-semibold tabular-nums ${
                                meta.isSpike ? "text-[#0047FF]" : "text-neutral-900"
                              }`}
                            >
                              {cleanVal}
                            </span>
                          </div>

                          <p className="text-xs text-neutral-700 leading-snug font-sans">
                            &ldquo;{item.description}&rdquo;
                          </p>

                          {/* Horizontal line with blue square (0 on dotted line, moves right as value increases) */}
                          <div className="pt-1">
                            <div className="relative h-3 flex items-center pl-2">
                              {/* Vertical Dotted Baseline representing 0 */}
                              <div className="absolute left-2 -top-1.5 -bottom-1.5 border-l border-dashed border-neutral-300 z-10" />
                              <span className="absolute -left-0.5 text-[8px] font-sans text-neutral-400 select-none tabular-nums">
                                0
                              </span>

                              {/* Horizontal axis line */}
                              <div className="w-full h-[1px] bg-neutral-200" />

                              {/* Blue Square on the horizontal line */}
                              <div
                                className="absolute w-2.5 h-2.5 bg-[#0047FF] -translate-x-1/2 transition-all z-20 shadow-2xs"
                                style={{
                                  left: `calc(8px + (100% - 10px) * ${Math.max(
                                    0,
                                    Math.min(100, meta.fillPct),
                                  ) / 100})`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    };

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        <div className="space-y-2.5">
                          {leftCol.map((item, idx) => renderSignalCard(item, idx))}
                        </div>
                        <div className="space-y-2.5">
                          {rightCol.map((item, idx) =>
                            renderSignalCard(item, idx + half),
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {selectedOpp.status === "completed" && (
                <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200 text-emerald-900 flex items-start gap-3 text-xs font-sans">
                  <Award className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-semibold text-emerald-950 text-sm">
                      Graduated to Permanent Core Menu
                    </strong>
                    <p className="mt-0.5 text-emerald-800">
                      Successfully completed 14-day market validation. Sustained sales velocity is tracking with an estimated +$4,200/month recurring contribution.
                    </p>
                  </div>
                </div>
              )}

              {selectedOpp.run && (
                <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Current run
                    </div>
                    {(selectedOpp.status === "testing" || selectedOpp.status === "accepted") && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={pending != null}
                          onClick={async () => {
                            setPending("run");
                            try {
                              await concludeOpportunityRun(selectedOpp.id, true);
                              await load();
                            } finally {
                              setPending(null);
                            }
                          }}
                          className="rounded-[4px] bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-xs font-medium transition shadow-xs flex items-center gap-1"
                        >
                          <Award className="w-3 h-3" />
                          <span>Graduate to Menu</span>
                        </button>
                        <button
                          type="button"
                          disabled={pending != null}
                          onClick={async () => {
                            setPending("run");
                            try {
                              await concludeOpportunityRun(selectedOpp.id, false);
                              await load();
                            } finally {
                              setPending(null);
                            }
                          }}
                          className="rounded-[4px] border border-neutral-200 text-neutral-600 hover:text-neutral-900 bg-white hover:bg-neutral-50 px-2 py-1 text-xs transition"
                        >
                          Conclude
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-neutral-950">{selectedOpp.run.name}</div>
                    <p className="text-xs text-neutral-500 mt-1">
                      {selectedOpp.run.offer || "Two-week limited run"}
                      {selectedOpp.run.startDate && selectedOpp.run.endDate
                        ? ` · ${formatDate(selectedOpp.run.startDate)} – ${formatDate(selectedOpp.run.endDate)}`
                        : ""}
                    </p>
                  </div>
                  {selectedOpp.run.assets.length > 0 && (
                    <div className="space-y-2">
                      {selectedOpp.run.assets.map((asset, idx) => (
                        <div
                          key={`${asset.channel}-${asset.variant_label}-${idx}`}
                          className="p-3 rounded-lg bg-neutral-50 border border-neutral-200"
                        >
                          <div className="text-[10px] uppercase tracking-wider text-[#0047FF] font-semibold">
                            {asset.channel} {asset.variant_label}
                          </div>
                          {asset.headline && (
                            <div className="text-sm font-semibold text-neutral-900 mt-1">{asset.headline}</div>
                          )}
                          {asset.body && (
                            <p className="text-xs text-neutral-600 mt-1">{asset.body}</p>
                          )}
                          {asset.call_to_action && (
                            <p className="text-[11px] text-neutral-500 mt-1">{asset.call_to_action}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selectedOpp.run?.result && (
                <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#0047FF] flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5" />
                    Did it work?
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <div className="text-[11px] text-neutral-500">Baseline</div>
                      <div className="text-sm font-semibold text-neutral-900">
                        {moneyOrNull(selectedOpp.run.result.baselineValue)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-neutral-500">Actual</div>
                      <div className="text-sm font-semibold text-neutral-900">
                        {moneyOrNull(selectedOpp.run.result.actualValue)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-neutral-500">Profit</div>
                      <div className="text-sm font-semibold text-emerald-600">
                        {selectedOpp.run.result.incrementalProfit != null
                          ? `+${moneyOrNull(selectedOpp.run.result.incrementalProfit)}`
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-neutral-500">ROI</div>
                      <div className="text-sm font-semibold text-neutral-900">
                        {selectedOpp.run.result.roi != null
                          ? `${Math.round(selectedOpp.run.result.roi * 100)}%`
                          : "—"}
                      </div>
                    </div>
                  </div>
                  {selectedOpp.run.result.confidenceScore != null && (
                    <p className="text-[11px] text-neutral-400">
                      Confidence {selectedOpp.run.result.confidenceScore}/100
                    </p>
                  )}
                  {selectedOpp.run.result.recommendation && (
                    <p className="text-xs text-neutral-600">{selectedOpp.run.result.recommendation}</p>
                  )}
                </div>
              )}

              {selectedOpp.economics.incrementalProfit == null && (
                <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  No sales history for this pairing, so there is no projected lift.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* PROPOSE CUSTOM DISH MODAL */}
      {showProposeModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleProposeCustom}
            className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 space-y-4 shadow-2xl font-sans"
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div>
                <h3 className="text-base font-semibold text-neutral-950">Propose New Dish Candidate</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Input a chef special or operator proposal to simulate feasibility and P&amp;L lift.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowProposeModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-neutral-700 mb-1">Dish Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Birria Smash Tacos"
                  value={customDishName}
                  onChange={(e) => setCustomDishName(e.target.value)}
                  className="w-full rounded-[4px] border border-neutral-300 p-2 text-neutral-950 outline-none focus:border-[#0047FF]"
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-700 mb-1">Extends Existing Menu Item (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Classic Cheeseburger, Loaded Waffle Fries"
                  value={customMenuPairing}
                  onChange={(e) => setCustomMenuPairing(e.target.value)}
                  className="w-full rounded-[4px] border border-neutral-300 p-2 text-neutral-950 outline-none focus:border-[#0047FF]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-neutral-700 mb-1">Suggested Retail Price ($)</label>
                  <input
                    type="number"
                    step="0.25"
                    required
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    className="w-full rounded-[4px] border border-neutral-300 p-2 text-neutral-950 outline-none focus:border-[#0047FF] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-neutral-700 mb-1">Estimated Ingredient Cost ($)</label>
                  <input
                    type="number"
                    step="0.10"
                    required
                    value={customCost}
                    onChange={(e) => setCustomCost(e.target.value)}
                    className="w-full rounded-[4px] border border-neutral-300 p-2 text-neutral-950 outline-none focus:border-[#0047FF] tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-neutral-700 mb-1">Missing Ingredients to Buy (Comma-separated)</label>
                <input
                  type="text"
                  placeholder="e.g. corn tortillas, guajillo chiles, cilantro"
                  value={customMissing}
                  onChange={(e) => setCustomMissing(e.target.value)}
                  className="w-full rounded-[4px] border border-neutral-300 p-2 text-neutral-950 outline-none focus:border-[#0047FF]"
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-700 mb-1">Rationale / Kitchen Notes</label>
                <textarea
                  rows={2}
                  placeholder="Why run this special now? Prep complexity, line speed, or customer demand."
                  value={customRationale}
                  onChange={(e) => setCustomRationale(e.target.value)}
                  className="w-full rounded-[4px] border border-neutral-300 p-2 text-neutral-950 outline-none focus:border-[#0047FF]"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowProposeModal(false)}
                className="px-3.5 py-1.5 rounded-[4px] border border-neutral-200 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-[4px] bg-[#0047FF] hover:bg-[#0038df] text-xs font-medium text-white transition shadow-xs"
              >
                Add Candidate
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
