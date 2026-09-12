"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Minus,
  Play,
} from "lucide-react";

import { startOpportunityRun, updateOpportunityStatus } from "@/lib/activation";
import {
  fetchRestaurantOpportunities,
  inboxGroup,
  type OpportunityCard,
  type OpportunityStatus,
} from "@/lib/opportunities";

type Filter = "inbox" | "running" | "passed";

function money(value: number | null | undefined, digits = 0) {
  if (value == null) return null;
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
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

function buildBrief(opp: OpportunityCard, city: string | null) {
  const parts: string[] = [];
  const dish = opp.menuItemName
    ? `your ${opp.menuItemName}`
    : "nothing you already sell";
  parts.push(`Put ${opp.dishName} on ${dish}.`);

  const growth = evidenceValue(opp, "trend_growth");
  if (growth) {
    parts.push(`${city || opp.trendRegion || "Local"} search is ${growth}.`);
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

  const profit = money(opp.economics.incrementalProfit);
  parts.push(
    profit
      ? `Two-week lift: +${profit}.`
      : "Do not treat this as a dollar forecast.",
  );

  return parts.join(" ");
}

export default function OpportunityMatrix() {
  const [opportunities, setOpportunities] = useState<OpportunityCard[]>([]);
  const [city, setCity] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("inbox");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"run" | "pass" | null>(null);

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
        setSelectedId(firstInbox?.id ?? null);
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
  }, []);

  const selectedOpp = opportunities.find((row) => row.id === selectedId) ?? null;

  const filtered = useMemo(
    () => opportunities.filter((row) => inboxGroup(row.status) === filter),
    [opportunities, filter],
  );

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
    if (opp.status !== "new") return;
    try {
      await updateOpportunityStatus(opp.id, "viewed");
      setOpportunities((current) =>
        current.map((row) => (row.id === opp.id ? { ...row, status: "viewed" } : row)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark as viewed");
    }
  }

  async function handlePass() {
    if (!selectedOpp) return;
    setPending("pass");
    setError(null);
    try {
      await updateOpportunityStatus(selectedOpp.id, "rejected");
      const rows = await load();
      setFilter("passed");
      setSelectedId(rows.find((row) => row.id === selectedOpp.id)?.id ?? selectedOpp.id);
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
      const rows = await load();
      setFilter("running");
      setSelectedId(rows.find((row) => row.id === selectedOpp.id)?.id ?? selectedOpp.id);
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
      <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6">
        <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
          This week{city ? ` in ${city}` : ""}
        </p>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
          What is worth running
        </h2>
        <p className="text-sm text-neutral-400 mt-1 max-w-2xl">
          Pair a live trend with a dish you already cook. Numbers come from your
          menu, sales, and inventory — not from a language model.
        </p>
      </div>

      {error && (
        <div className="bg-rose-950/40 border border-rose-800 rounded-xl p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-12 text-center text-sm text-neutral-400">
          Loading this week&apos;s pairings…
        </div>
      )}

      {!loading && opportunities.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-3">
            <div className="flex gap-1 bg-neutral-950 border border-neutral-800 p-1 rounded-xl">
              {(["inbox", "running", "passed"] as Filter[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold capitalize ${
                    filter === key
                      ? "bg-neutral-800 text-white"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {key} {counts[key]}
                </button>
              ))}
            </div>

            <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
              {filtered.length === 0 && (
                <p className="text-xs text-neutral-500 px-1 py-6 text-center">
                  Nothing in {filter}.
                </p>
              )}
              {filtered.map((opp) => (
                <button
                  key={opp.id}
                  type="button"
                  onClick={() => void selectOpportunity(opp)}
                  className={`w-full text-left p-3.5 rounded-xl border transition ${
                    selectedOpp?.id === opp.id
                      ? "bg-neutral-850 border-cyan-500/80"
                      : "bg-neutral-900/50 hover:bg-neutral-900 border-neutral-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-white truncate">{opp.dishName}</h4>
                      <p className="text-[11px] text-neutral-400 mt-1 truncate">
                        {opp.menuItemName ? `Extends ${opp.menuItemName}` : "No menu match"}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-neutral-400 shrink-0">
                      {statusLabel(opp.status)}
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-400 mt-2">
                    {opp.economics.incrementalProfit != null
                      ? `+${money(opp.economics.incrementalProfit)} profit`
                      : "No sales baseline"}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {selectedOpp && (
            <div className="lg:col-span-2 space-y-5">
              <div className="bg-neutral-900/70 border border-neutral-800 rounded-xl p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-semibold bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                    {statusLabel(selectedOpp.status)}
                  </span>
                  {selectedOpp.trendName && (
                    <span className="text-[11px] text-neutral-400">
                      Trend: {selectedOpp.trendName}
                    </span>
                  )}
                </div>
                <h3 className="text-2xl font-extrabold text-white mt-2">{selectedOpp.dishName}</h3>
                <p className="text-sm text-neutral-300 mt-2 leading-relaxed">
                  {buildBrief(selectedOpp, city)}
                </p>
                {selectedOpp.recommendation && (
                  <p className="text-xs text-neutral-400 mt-3">{selectedOpp.recommendation}</p>
                )}

                {canDecide && (
                  <div className="flex flex-wrap gap-2 mt-5">
                    <button
                      type="button"
                      disabled={pending != null}
                      onClick={() => void handleRun()}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-sm"
                    >
                      <Play className="w-4 h-4" />
                      {pending === "run" ? "Starting…" : "Run 2 weeks"}
                    </button>
                    <button
                      type="button"
                      disabled={pending != null}
                      onClick={() => void handlePass()}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-neutral-700 text-neutral-200 hover:bg-neutral-800 font-bold text-sm"
                    >
                      <Minus className="w-4 h-4" />
                      {pending === "pass" ? "Saving…" : "Pass"}
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                  <div className="text-[11px] text-neutral-400">Extends</div>
                  <div className="text-sm font-bold text-white mt-1">
                    {selectedOpp.menuItemName ?? "None"}
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">
                    {selectedOpp.menuItemPrice != null
                      ? `Now ${money(selectedOpp.menuItemPrice, 2)}`
                      : "No priced pairing"}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                  <div className="text-[11px] text-neutral-400">Per plate</div>
                  <div className="text-sm font-bold text-emerald-400 mt-1">
                    {money(selectedOpp.economics.proposedContribution, 2) ?? "—"}
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">
                    {selectedOpp.economics.suggestedPrice != null
                      ? `${money(selectedOpp.economics.suggestedPrice, 2)} suggested`
                      : "No price yet"}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                  <div className="text-[11px] text-neutral-400">Two-week profit</div>
                  <div className="text-sm font-bold text-white mt-1">
                    {selectedOpp.economics.incrementalProfit != null
                      ? `+${money(selectedOpp.economics.incrementalProfit)}`
                      : "—"}
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">
                    {selectedOpp.economics.incrementalProfit == null
                      ? "Needs a sales baseline"
                      : "Snapshotted from sales"}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                  <div className="text-[11px] text-neutral-400">Buy today</div>
                  <div className="text-sm font-bold text-cyan-400 mt-1">
                    {selectedOpp.missingIngredients.length
                      ? selectedOpp.missingIngredients.join(", ")
                      : "Nothing"}
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">Missing ingredients</div>
                </div>
              </div>

              <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                  Why this number
                </div>
                <div className="mt-3 space-y-2">
                  {selectedOpp.evidence.length === 0 && (
                    <p className="text-xs text-neutral-500">No stored evidence for this pairing.</p>
                  )}
                  {selectedOpp.evidence.map((item) => (
                    <div
                      key={`${item.evidence_type}-${item.source}`}
                      className="flex items-start justify-between gap-3 text-xs"
                    >
                      <span className="text-neutral-400">{item.description}</span>
                      <span className="font-mono font-bold text-white shrink-0">
                        {item.display_value}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-2 mt-4 pt-3 border-t border-neutral-800">
                  {[
                    ["Trend", selectedOpp.scorecard.trendStrength],
                    ["Local", selectedOpp.scorecard.localRelevance],
                    ["Menu", selectedOpp.scorecard.menuFit],
                    ["Ops", selectedOpp.scorecard.operationalFit],
                    ["Margin", selectedOpp.scorecard.profitability],
                  ].map(([label, value]) => (
                    <div key={label} className="text-center">
                      <div className="text-[10px] text-neutral-500">{label}</div>
                      <div className="text-xs font-mono text-neutral-200">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedOpp.run && (
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                    Current run
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">{selectedOpp.run.name}</div>
                    <p className="text-xs text-neutral-400 mt-1">
                      {selectedOpp.run.offer || "Two-week limited run"}
                      {selectedOpp.run.startDate && selectedOpp.run.endDate
                        ? ` · ${formatDate(selectedOpp.run.startDate)} – ${formatDate(selectedOpp.run.endDate)}`
                        : ""}
                    </p>
                  </div>
                  {selectedOpp.run.assets.length > 0 && (
                    <div className="space-y-2">
                      {selectedOpp.run.assets.map((asset) => (
                        <div
                          key={`${asset.channel}-${asset.variant_label}`}
                          className="p-3 rounded-lg bg-neutral-950 border border-neutral-800"
                        >
                          <div className="text-[10px] uppercase tracking-wider text-cyan-400">
                            {asset.channel} {asset.variant_label}
                          </div>
                          {asset.headline && (
                            <div className="text-sm font-bold text-white mt-1">{asset.headline}</div>
                          )}
                          {asset.body && (
                            <p className="text-xs text-neutral-400 mt-1">{asset.body}</p>
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
                <div className="bg-emerald-950/20 border border-emerald-800/60 rounded-xl p-4 space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5" />
                    Did it work?
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <div className="text-[11px] text-neutral-400">Baseline</div>
                      <div className="text-sm font-bold text-white">
                        {money(selectedOpp.run.result.baselineValue)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-neutral-400">Actual</div>
                      <div className="text-sm font-bold text-white">
                        {money(selectedOpp.run.result.actualValue)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-neutral-400">Profit</div>
                      <div className="text-sm font-bold text-emerald-400">
                        {selectedOpp.run.result.incrementalProfit != null
                          ? `+${money(selectedOpp.run.result.incrementalProfit)}`
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-neutral-400">ROI</div>
                      <div className="text-sm font-bold text-white">
                        {selectedOpp.run.result.roi != null
                          ? `${Math.round(selectedOpp.run.result.roi * 100)}%`
                          : "—"}
                      </div>
                    </div>
                  </div>
                  {selectedOpp.run.result.confidenceScore != null && (
                    <p className="text-[11px] text-neutral-500">
                      Confidence {selectedOpp.run.result.confidenceScore}/100
                    </p>
                  )}
                  {selectedOpp.run.result.recommendation && (
                    <p className="text-xs text-neutral-300">{selectedOpp.run.result.recommendation}</p>
                  )}
                </div>
              )}

              {selectedOpp.economics.incrementalProfit == null && (
                <div className="flex items-start gap-2 text-xs text-amber-200/90 bg-amber-950/20 border border-amber-800/50 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  No sales history for this pairing, so there is no projected lift.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
