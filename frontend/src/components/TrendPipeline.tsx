"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import type { ScrapedDish } from "@/lib/contractTypes";
import { compactNumber } from "@/lib/format";

type Stage = "discover" | "analyze" | "campaign";
type Engine = "gemini" | "backboard";

export default function TrendPipeline({
  dishes,
  selectedDish,
  scrapeMeta,
  onSelectDish,
  onUseInKitchen,
}: {
  dishes: ScrapedDish[];
  selectedDish: ScrapedDish | null;
  scrapeMeta: { fixture?: boolean; sourcesUsed?: string[] };
  onSelectDish: (dish: ScrapedDish) => void;
  onUseInKitchen: () => void;
}) {
  const [stage, setStage] = useState<Stage>("discover");
  const [engine, setEngine] = useState<Engine>("gemini");
  const [customKey, setCustomKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [analysisText, setAnalysisText] = useState("");
  const [playbookText, setPlaybookText] = useState("");
  const [copied, setCopied] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const topic = selectedDish?.name || "";

  async function enrichLive() {
    if (!topic) return;
    setIsEnriching(true);
    setEnrichError(null);
    try {
      const res = await fetch("/api/trends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: topic, apiKey: customKey || undefined }),
      });
      const data = await res.json();
      if (!data.success) {
        setEnrichError(data.error || "Live enrich failed");
      }
    } catch (err) {
      setEnrichError(err instanceof Error ? err.message : "Live enrich failed");
    } finally {
      setIsEnriching(false);
    }
  }

  async function runAnalysis() {
    if (!selectedDish) return;
    setIsAnalyzing(true);
    setStage("analyze");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          signals: (selectedDish.evidence || []).map((item, index) => ({
            id: `${selectedDish.id}-${index}`,
            platform: item.source,
            caption: item.excerpt,
            views: item.engagement || 0,
          })),
          engine,
          apiKey: customKey || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) setAnalysisText(data.analysisText);
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function generateCampaign() {
    setIsGenerating(true);
    setStage("campaign");
    try {
      const res = await fetch("/api/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          analysisText,
          engine,
          apiKey: customKey || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) setPlaybookText(data.playbookText);
    } finally {
      setIsGenerating(false);
    }
  }

  function downloadReport() {
    const content = `# ${topic}\n\n${selectedDish?.why_trending?.summary || ""}\n\n## Analysis\n${analysisText}\n\n## Campaign\n${playbookText}`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${topic.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/80">Discover</p>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-stone-50 mt-1">
            What’s moving this week
          </h2>
          <p className="text-sm text-stone-400 mt-1 max-w-xl">
            Ranked from YouTube and Google Trends. Pick a dish, then analyze or take it to Kitchen.
            {scrapeMeta.fixture ? " Showing the sample contract until a live scrape is written." : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["discover", "analyze", "campaign"] as Stage[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setStage(id)}
              className={`rounded-full px-3 py-1.5 text-xs capitalize ${
                stage === id ? "bg-stone-100 text-stone-950" : "text-stone-400 hover:text-stone-100"
              }`}
            >
              {id}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="p-2 text-stone-500 hover:text-stone-200"
            title="Engine settings"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {stage === "discover" && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,18rem)_1fr] gap-5">
          <aside className="rounded-2xl border border-stone-800 bg-[#141210] overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-800 text-[11px] uppercase tracking-wider text-stone-500">
              Ranked dishes
            </div>
            <div className="max-h-[640px] overflow-y-auto">
              {dishes.length === 0 && (
                <p className="px-4 py-8 text-sm text-stone-500">
                  No scrape yet. Run <code className="text-stone-300">python -m ingestion.pipeline</code>.
                </p>
              )}
              {dishes.map((dish, index) => {
                const active = selectedDish?.id === dish.id;
                return (
                  <button
                    key={dish.id}
                    type="button"
                    onClick={() => onSelectDish(dish)}
                    className={`w-full text-left px-4 py-3 border-b border-stone-800/80 transition ${
                      active ? "bg-stone-100 text-stone-950" : "hover:bg-stone-900/60"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={`text-[11px] tabular-nums ${active ? "text-stone-500" : "text-stone-500"}`}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className={`text-sm tabular-nums ${active ? "text-stone-700" : "text-amber-200/90"}`}>
                        {dish.trend_score.toFixed(0)}
                      </span>
                    </div>
                    <div className={`mt-1 text-sm font-medium leading-snug ${active ? "text-stone-950" : "text-stone-100"}`}>
                      {dish.name}
                    </div>
                    <div className={`mt-1 text-[11px] capitalize ${active ? "text-stone-500" : "text-stone-500"}`}>
                      {dish.momentum}
                      {dish.metrics?.mention_count != null
                        ? ` · ${dish.metrics.mention_count} mentions`
                        : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {selectedDish ? (
            <section className="rounded-2xl border border-stone-800 bg-[#141210] p-5 sm:p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-stone-500">
                    {selectedDish.momentum} · score {selectedDish.trend_score.toFixed(0)}
                  </div>
                  <h3 className="text-2xl font-semibold text-stone-50 mt-1">{selectedDish.name}</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void enrichLive()}
                    disabled={isEnriching}
                    className="rounded-full border border-stone-700 px-3 py-1.5 text-xs text-stone-200 hover:bg-stone-900"
                  >
                    {isEnriching ? "Enriching…" : "Live enrich"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runAnalysis()}
                    disabled={isAnalyzing}
                    className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-950"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      {isAnalyzing ? "Analyzing…" : "Analyze"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={onUseInKitchen}
                    className="rounded-full border border-stone-700 px-3 py-1.5 text-xs text-stone-200 hover:bg-stone-900"
                  >
                    Use in Kitchen
                  </button>
                </div>
              </div>

              {enrichError && (
                <p className="text-xs text-rose-300">{enrichError}</p>
              )}

              {selectedDish.why_trending?.summary && (
                <p className="text-sm text-stone-300 leading-relaxed">
                  {selectedDish.why_trending.summary}
                </p>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Mentions" value={String(selectedDish.metrics?.mention_count ?? "—")} />
                <Stat label="Local" value={String(selectedDish.metrics?.local_mention_count ?? "—")} />
                <Stat
                  label="Reach"
                  value={compactNumber(selectedDish.metrics?.total_engagement)}
                />
                <Stat
                  label="Positive"
                  value={
                    selectedDish.metrics?.sentiment?.positive != null
                      ? `${Math.round(selectedDish.metrics.sentiment.positive * 100)}%`
                      : "—"
                  }
                />
              </div>

              {selectedDish.why_trending?.drivers?.length ? (
                <ul className="space-y-1.5 text-sm text-stone-400">
                  {selectedDish.why_trending.drivers.map((driver) => (
                    <li key={driver}>— {driver}</li>
                  ))}
                </ul>
              ) : null}

              <div>
                <div className="text-[11px] uppercase tracking-wider text-stone-500 mb-3">Evidence</div>
                <div className="space-y-3">
                  {(selectedDish.evidence || []).map((item, index) => (
                    <article
                      key={`${item.url}-${index}`}
                      className="rounded-xl border border-stone-800 bg-[#0c0b0a] p-4"
                    >
                      <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-wider text-stone-500">
                        <span>{item.source.replaceAll("_", " ")}</span>
                        <span>{compactNumber(item.engagement)}</span>
                      </div>
                      <p className="mt-2 text-sm text-stone-200 leading-relaxed">{item.excerpt}</p>
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs text-amber-200/90 hover:text-amber-100"
                        >
                          Open source <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-800 p-10 text-sm text-stone-500">
              Select a scraped dish to see why it ranked.
            </div>
          )}
        </div>
      )}

      {stage === "analyze" && (
        <section className="rounded-2xl border border-stone-800 bg-[#141210] p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-medium text-stone-50">Analysis</h3>
              <p className="text-sm text-stone-400">{topic || "Pick a dish first"}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void runAnalysis()}
                disabled={isAnalyzing || !selectedDish}
                className="rounded-full border border-stone-700 px-3 py-1.5 text-xs text-stone-200"
              >
                <span className="inline-flex items-center gap-1.5">
                  <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? "animate-spin" : ""}`} />
                  {isAnalyzing ? "Working…" : "Re-run"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void generateCampaign()}
                disabled={!analysisText || isGenerating}
                className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-950"
              >
                Campaign
              </button>
            </div>
          </div>
          {isAnalyzing ? (
            <p className="text-sm text-stone-500 py-10 text-center">Reading the scrape evidence…</p>
          ) : analysisText ? (
            <pre className="whitespace-pre-wrap text-sm text-stone-300 leading-relaxed font-sans">
              {analysisText}
            </pre>
          ) : (
            <p className="text-sm text-stone-500 py-10 text-center">
              Analyze a ranked dish to turn scrape evidence into a kitchen brief.
            </p>
          )}
        </section>
      )}

      {stage === "campaign" && (
        <section className="rounded-2xl border border-stone-800 bg-[#141210] p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-medium text-stone-50">Campaign</h3>
              <p className="text-sm text-stone-400">Sized later against the P&L envelope.</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(playbookText);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
                disabled={!playbookText}
                className="rounded-full border border-stone-700 px-3 py-1.5 text-xs text-stone-200"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Copy className="w-3.5 h-3.5" />
                  {copied ? "Copied" : "Copy"}
                </span>
              </button>
              <button
                type="button"
                onClick={downloadReport}
                disabled={!playbookText}
                className="rounded-full border border-stone-700 px-3 py-1.5 text-xs text-stone-200"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" />
                  Download
                </span>
              </button>
            </div>
          </div>
          {isGenerating ? (
            <p className="text-sm text-stone-500 py-10 text-center">Writing the playbook…</p>
          ) : playbookText ? (
            <pre className="whitespace-pre-wrap text-sm text-stone-300 leading-relaxed font-sans">
              {playbookText}
            </pre>
          ) : (
            <p className="text-sm text-stone-500 py-10 text-center">
              Run analysis first, then generate a campaign inside this month’s caps.
            </p>
          )}
        </section>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-stone-800 bg-[#141210] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-medium text-stone-50">Engine</h3>
              <button type="button" onClick={() => setShowSettings(false)} className="text-stone-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block text-sm text-stone-300">
              Model
              <select
                value={engine}
                onChange={(event) => setEngine(event.target.value as Engine)}
                className="mt-1 w-full rounded-lg border border-stone-800 bg-[#0c0b0a] p-2.5 text-stone-100"
              >
                <option value="gemini">Gemini</option>
                <option value="backboard">Backboard</option>
              </select>
            </label>
            <label className="block text-sm text-stone-300">
              Optional API key
              <input
                type="password"
                value={customKey}
                onChange={(event) => setCustomKey(event.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-800 bg-[#0c0b0a] p-2.5 text-stone-100"
              />
            </label>
            <p className="text-xs text-stone-500 inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Defaults to the environment key.
            </p>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="w-full rounded-full bg-stone-100 py-2 text-sm font-medium text-stone-950"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-800 bg-[#0c0b0a] px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wider text-stone-500">{label}</div>
      <div className="mt-1 text-sm text-stone-100">{value}</div>
    </div>
  );
}
