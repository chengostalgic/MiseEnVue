"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Flame,
  Instagram,
  Megaphone,
  MessageCircle,
  Music,
  Radio,
  RefreshCw,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Users,
  UtensilsCrossed,
  Video,
  X,
} from "lucide-react";
import type { ScrapedDish } from "@/lib/contractTypes";
import { compactNumber } from "@/lib/format";
import {
  enqueueGeneration,
  jobBusy,
  setAnalysis,
  setPlaybook,
  useGenerationJobs,
} from "@/lib/generationJobs";

type Engine = "gemini" | "backboard";

interface ParsedPlaybook {
  dishName: string;
  instagram: {
    hook: string;
    audio: string;
    caption: string;
    hashtags: string[];
  };
  tiktok: Array<{
    time: string;
    action: string;
  }>;
  facebook: {
    headline: string;
    angle: string;
    cta: string;
  };
  influencer: {
    pitch: string;
  };
}

function parsePlaybook(rawText: string, fallbackTopic: string): ParsedPlaybook {
  const topic = fallbackTopic || "Chili crisp hot honey wings";

  const defaults: ParsedPlaybook = {
    dishName: topic,
    instagram: {
      hook: `Extreme macro shot slicing into ${topic}, revealing molten texture / steam.`,
      audio: "Trending lo-fi culinary chillhop beat.",
      caption: `The crunch you've been seeing all over your feed is officially here. Smashed to order, finished with house drizzle. Available this weekend only! Tag someone who owes you dinner`,
      hashtags: [
        `#${topic.replace(/[^a-zA-Z0-9]/g, "")}`,
        "#FoodieGram",
        "#MustEat",
        "#LocalEats",
        "#CrunchTest",
      ],
    },
    tiktok: [
      { time: "0.0s – 0.8s", action: "High-gain audio crunch snap." },
      { time: "0.9s – 3.5s", action: "Griddle smash & sizzling drizzle pour." },
      { time: "3.6s – 6.0s", action: "Taste test reaction." },
      { time: "6.1s – 9.0s", action: "Limited daily batches — link in bio to reserve." },
    ],
    facebook: {
      headline: `Meet our newest kitchen creation: ${topic}.`,
      angle: "Scratch-made with local farm ingredients.",
      cta: "Book a table or order direct online.",
    },
    influencer: {
      pitch: `Hey [Name]! Love your local food spots guide. We just introduced a chef's special ${topic} on our menu and would love to host you and a guest for dinner on us this week. Let us know if you'd like us to save you a booth!`,
    },
  };

  if (!rawText || rawText.trim().length === 0) return defaults;

  try {
    // Parse Instagram
    const igSection =
      rawText.match(/####\s*1\.\s*Instagram[^\n]*\n([\s\S]*?)(?=####\s*2\.|$)/i)?.[1] || "";
    const hookMatch = igSection.match(/Visual Hook[^\n:]*:\s*([^\n]+)/i);
    const audioMatch = igSection.match(/Audio Pairing[^\n:]*:\s*([^\n]+)/i);
    const captionMatch = igSection.match(
      /Caption\s*&\s*Hashtags[^\n:]*:\s*([\s\S]*?)(?=\n\n|\n####|$)/i,
    );
    const hashtagsFound = igSection.match(/#[a-zA-Z0-9_]+/g);

    // Parse TikTok
    const tiktokSection =
      rawText.match(/####\s*2\.\s*TikTok[^\n]*\n([\s\S]*?)(?=####\s*3\.|$)/i)?.[1] || "";
    const cutMatches = Array.from(
      tiktokSection.matchAll(/[-•*]?\s*([0-9.]+s?[–-][0-9.]+s?):\s*([^\n]+)/gi),
    );
    const parsedTiktok =
      cutMatches.length > 0
        ? cutMatches.map((m) => ({ time: m[1], action: m[2].trim() }))
        : defaults.tiktok;

    // Parse Facebook
    const fbSection =
      rawText.match(/####\s*3\.\s*[^\n]*Facebook[^\n]*\n([\s\S]*?)(?=####\s*4\.|$)/i)?.[1] || "";
    const headlineMatch = fbSection.match(/Headline[^\n:]*:\s*([^\n]+)/i);
    const angleMatch = fbSection.match(/Angle[^\n:]*:\s*([^\n]+)/i);
    const ctaMatch = fbSection.match(/Call to Action[^\n:]*:\s*([^\n]+)/i);

    // Parse Influencer
    const infSection =
      rawText.match(/####\s*4\.\s*[^\n]*Influencer[^\n]*\n([\s\S]*?)$/i)?.[1] || "";
    const pitchQuote = infSection.match(/["“]([\s\S]*?)["”]/);

    return {
      dishName: topic,
      instagram: {
        hook: hookMatch ? hookMatch[1].trim() : defaults.instagram.hook,
        audio: audioMatch ? audioMatch[1].trim() : defaults.instagram.audio,
        caption: captionMatch
          ? captionMatch[1]
              .replace(/#[a-zA-Z0-9_]+/g, "")
              .replace(/^["“]|["”]$/g, "")
              .trim()
          : defaults.instagram.caption,
        hashtags: hashtagsFound && hashtagsFound.length > 0 ? hashtagsFound : defaults.instagram.hashtags,
      },
      tiktok: parsedTiktok,
      facebook: {
        headline: headlineMatch ? headlineMatch[1].trim() : defaults.facebook.headline,
        angle: angleMatch ? angleMatch[1].trim() : defaults.facebook.angle,
        cta: ctaMatch ? ctaMatch[1].trim() : defaults.facebook.cta,
      },
      influencer: {
        pitch: pitchQuote ? pitchQuote[1].trim() : defaults.influencer.pitch,
      },
    };
  } catch {
    return defaults;
  }
}

export default function TrendPipeline({
  dishes,
  selectedDish,
  scrapeMeta,
  restaurantCity,
  cuisine,
  onSelectDish,
  onUseInKitchen,
  onNavigateToCampaign,
  onNavigateToDiscover,
  onRefresh,
  activeMode = "discover",
}: {
  dishes: ScrapedDish[];
  selectedDish: ScrapedDish | null;
  scrapeMeta: {
    fixture?: boolean;
    source?: string;
    cuisine?: string | null;
    queries?: string[];
    sourcesUsed?: string[];
    market?: { city?: string; county?: string; region_name?: string; state?: string };
  };
  restaurantCity?: string | null;
  cuisine?: string | null;
  onSelectDish: (dish: ScrapedDish) => void;
  onUseInKitchen: () => void;
  onNavigateToCampaign?: () => void;
  onNavigateToDiscover?: () => void;
  onRefresh?: () => void;
  activeMode?: "discover" | "campaign";
}) {
  const generation = useGenerationJobs();
  const [engine, setEngine] = useState<Engine>("gemini");
  const [customKey, setCustomKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const [isEnriching, setIsEnriching] = useState(false);
  const isAnalyzing = jobBusy("analyze", generation);
  const isGenerating = jobBusy("campaign", generation);
  const analysisMap = generation.analyses;
  const playbookMap = generation.playbooks;
  const [enrichedSignalsMap, setEnrichedSignalsMap] = useState<Record<string, any[]>>({});
  const [enrichNotice, setEnrichNotice] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [campaignViewMode, setCampaignViewMode] = useState<"cards" | "raw" | "edit">("cards");
  const [momentumFilter, setMomentumFilter] = useState<"all" | "rising" | "stable" | "explosive">("all");

  const [editIgHook, setEditIgHook] = useState("");
  const [editIgCaption, setEditIgCaption] = useState("");
  const [editFbHeadline, setEditFbHeadline] = useState("");
  const [editFbAngle, setEditFbAngle] = useState("");
  const [editFbCta, setEditFbCta] = useState("");
  const [editDmPitch, setEditDmPitch] = useState("");

  const topic = selectedDish?.name || "Chili crisp hot honey wings";
  const currentAnalysis = analysisMap[topic] || "";
  const currentPlaybookText = playbookMap[topic] || "";

  const parsedPlaybook = useMemo(() => {
    return parsePlaybook(currentPlaybookText, topic);
  }, [currentPlaybookText, topic]);

  useEffect(() => {
    if (campaignViewMode === "edit") {
      setEditIgHook(parsedPlaybook.instagram.hook);
      setEditIgCaption(parsedPlaybook.instagram.caption);
      setEditFbHeadline(parsedPlaybook.facebook.headline);
      setEditFbAngle(parsedPlaybook.facebook.angle);
      setEditFbCta(parsedPlaybook.facebook.cta);
      setEditDmPitch(parsedPlaybook.influencer.pitch);
    }
  }, [campaignViewMode, parsedPlaybook]);

  function saveEditedPlaybook() {
    const updated = `### 4-Channel Launch Playbook: ${topic}

#### 1. Instagram Reels (Visual ASMR Hook)
• Visual Hook (0–2s): ${editIgHook}
• Audio Pairing: ${parsedPlaybook.instagram.audio}
• Caption & Hashtags:
  "${editIgCaption}
  ${parsedPlaybook.instagram.hashtags.join(" ")}"

#### 2. TikTok 9-Second Fast Cut
• Cut Sequence:
${parsedPlaybook.tiktok.map((c) => `  - ${c.time}: ${c.action}`).join("\n")}

#### 3. Hyper-Local Facebook Community Ad
• Headline: ${editFbHeadline}
• Angle: ${editFbAngle}
• Call to Action: "${editFbCta}"

#### 4. Local Foodie Influencer DM Pitch
• "${editDmPitch}"
`;
    setPlaybook(topic, updated);
    setCampaignViewMode("cards");
  }

  const filteredDishes = useMemo(() => {
    return dishes.filter((dish) => {
      if (momentumFilter !== "all" && dish.momentum !== momentumFilter) {
        return false;
      }
      return true;
    });
  }, [dishes, momentumFilter]);

  const activeEvidence = useMemo(() => {
    const live = enrichedSignalsMap[topic] || [];
    const base = selectedDish?.evidence || [];
    return [...live, ...base];
  }, [enrichedSignalsMap, topic, selectedDish]);

  function copyToClipboard(text: string, key: string) {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  }

  async function enrichLive() {
    if (!topic) return;
    setIsEnriching(true);
    setEnrichError(null);
    setEnrichNotice(null);
    try {
      const res = await fetch("/api/trends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: topic, apiKey: customKey || undefined }),
      });
      const data = await res.json();
      if (!data.success) {
        setEnrichError(data.error || "Live enrich failed");
      } else if (data.realtimeData?.signals) {
        const liveItems = data.realtimeData.signals.map((s: any) => ({
          source: s.platform || "youtube",
          display_value: s.views ? `${compactNumber(s.views)} engagement` : "Live Signal",
          excerpt: s.caption,
          engagement: s.views || 0,
          url: s.evidenceUrl || "https://youtube.com",
          isLive: true,
        }));
        setEnrichedSignalsMap((prev) => ({
          ...prev,
          [topic]: liveItems,
        }));
        setEnrichNotice(`Verified ${liveItems.length} fresh real-time signals for "${topic}"`);
        setTimeout(() => setEnrichNotice(null), 5000);
      }
    } catch (err) {
      setEnrichError(err instanceof Error ? err.message : "Live enrich failed");
    } finally {
      setIsEnriching(false);
    }
  }

  function runAnalysis() {
    if (!selectedDish) return;
    const dish = selectedDish;
    const dishTopic = dish.name;
    enqueueGeneration("analyze", async () => {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: dishTopic,
          signals: (dish.evidence || []).map((item, index) => ({
            id: `${dish.id}-${index}`,
            platform: item.source,
            caption: item.excerpt,
            views: item.engagement || 0,
          })),
          engine,
          apiKey: customKey || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Analyze failed");
      setAnalysis(dishTopic, data.analysisText);
    });
  }

  function generateCampaign() {
    const dishTopic = topic;
    const analysisText =
      currentAnalysis ||
      `Demand for ${dishTopic} is surging across social channels with high viral engagement. Feasible on existing line with minimal ingredient expansion.`;
    enqueueGeneration("campaign", async () => {
      const res = await fetch("/api/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: dishTopic,
          analysisText,
          engine,
          apiKey: customKey || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Campaign failed");
      setPlaybook(dishTopic, data.playbookText);
      onNavigateToCampaign?.();
    });
  }

  function downloadReport() {
    const rawContent =
      currentPlaybookText ||
      `### 4-Channel Launch Playbook: ${topic}

#### 1. Instagram Reels (Visual ASMR Hook)
• Visual Hook (0–2s): ${parsedPlaybook.instagram.hook}
• Audio Pairing: ${parsedPlaybook.instagram.audio}
• Caption & Hashtags:
  "${parsedPlaybook.instagram.caption}
  ${parsedPlaybook.instagram.hashtags.join(" ")}"

#### 2. TikTok 9-Second Fast Cut
• Cut Sequence:
${parsedPlaybook.tiktok.map((c) => `  - ${c.time}: ${c.action}`).join("\n")}

#### 3. Hyper-Local Facebook Community Ad
• Headline: ${parsedPlaybook.facebook.headline}
• Angle: ${parsedPlaybook.facebook.angle}
• Call to Action: "${parsedPlaybook.facebook.cta}"

#### 4. Local Foodie Influencer DM Pitch
• "${parsedPlaybook.influencer.pitch}"
`;

    const content = `# ${topic} Launch Playbook\n\n${
      selectedDish?.why_trending?.summary || ""
    }\n\n## Analysis\n${currentAnalysis || "Generated via MiseEnVue Autonomous Intelligence."}\n\n## Campaign\n${rawContent}`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${topic.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_campaign.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 select-none font-sans">
      {/* ========================================================================= */}
      {/* MODE 1: DISCOVER VIEW */}
      {/* ========================================================================= */}
      {activeMode === "discover" && (
        <>
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-neutral-100">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-sans text-neutral-500">
                <span className="text-[#0047FF] font-semibold uppercase tracking-wider">
                  Demand Radar &amp; Pipeline
                </span>
                <span>·</span>
                <span>Autonomous Culinary Signals</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-light tracking-tight text-neutral-950 mt-1">
                What’s moving this week
              </h2>
              <p className="text-xs text-neutral-500 mt-1 max-w-2xl font-light">
                {[cuisine || scrapeMeta.cuisine, scrapeMeta.market?.city || restaurantCity].filter(Boolean).join(" · ") ||
                  "Ranked from live YouTube and kitchen scrape."}
                {scrapeMeta.source === "live" ? " · Live pull" : ""}
                {scrapeMeta.fixture ? " · Sample fixture" : ""}
              </p>
            </div>

            {/* Action Controls */}
            <div className="flex items-center gap-2 self-start md:self-end">
              {onRefresh ? (
                <button
                  type="button"
                  onClick={onRefresh}
                  className="border border-neutral-300 rounded-[4px] px-3 py-1.5 text-xs text-neutral-900 bg-white hover:bg-neutral-50 transition shadow-2xs font-sans inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#0047FF]" />
                  <span>Refresh scrape</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void enrichLive()}
                disabled={isEnriching}
                className="border border-neutral-300 rounded-[4px] px-3 py-1.5 text-xs text-neutral-900 bg-white hover:bg-neutral-50 transition shadow-2xs font-sans inline-flex items-center gap-1.5"
              >
                <Radio className={`w-3.5 h-3.5 text-[#0047FF] ${isEnriching ? "animate-pulse" : ""}`} />
                <span>{isEnriching ? "Enriching…" : "Live Enrich"}</span>
              </button>

              <button
                type="button"
                onClick={() => void runAnalysis()}
                disabled={isAnalyzing || !selectedDish}
                className="rounded-[4px] bg-[#0047FF] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#0038df] transition shadow-xs flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {generation.jobs.analyze.status === "queued"
                    ? "Queued…"
                    : isAnalyzing
                      ? "Analyzing…"
                      : "Run Analysis"}
                </span>
              </button>
              {generation.jobs.analyze.status === "queued" || generation.jobs.analyze.status === "running" ? (
                <span className="text-[11px] text-[#0047FF]">
                  {generation.jobs.analyze.status === "queued"
                    ? "Queued — leave anytime, the write-up stays."
                    : "Running — leave anytime, the write-up stays."}
                </span>
              ) : null}

              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="w-8 h-8 flex items-center justify-center border border-neutral-300 rounded-[4px] hover:bg-neutral-50 bg-white transition text-neutral-900 shadow-2xs"
                title="Engine settings"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Discover Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,20rem)_1fr] gap-6 items-start">
            {/* Left Dishes Ledger */}
            <aside className="rounded-xl border border-neutral-200 bg-white shadow-2xs overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-100 text-[11px] font-sans uppercase tracking-wider text-neutral-500 flex items-center justify-between">
                <span>Ranked Dishes</span>
                <span className="text-[10px] text-neutral-400 font-normal">Live Signal Velocity</span>
              </div>
              <div className="p-2.5 border-b border-neutral-100 bg-neutral-50/50">
                <div className="flex gap-1 text-[10px] font-sans">
                  {(["all", "rising", "stable", "explosive"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMomentumFilter(m)}
                      className={`px-2.5 py-1 rounded-[4px] capitalize transition font-sans ${
                        momentumFilter === m
                          ? "bg-neutral-950 text-white font-medium shadow-2xs"
                          : "text-neutral-500 hover:text-neutral-900 bg-white border border-neutral-200"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="max-h-[640px] overflow-y-auto divide-y divide-neutral-100">
                {filteredDishes.length === 0 && (
                  <p className="px-4 py-8 text-xs text-neutral-400 text-center font-sans">
                    No matching dishes found.
                  </p>
                )}
                {filteredDishes.map((dish, index) => {
                  const active = selectedDish?.id === dish.id;
                  const thumb = dish.evidence?.find((item) => item.image)?.image;
                  return (
                    <button
                      key={dish.id}
                      type="button"
                      onClick={() => onSelectDish(dish)}
                      className={`w-full text-left px-3 py-3 transition ${
                        active
                          ? "bg-blue-50/50 border-l-2 border-l-[#0047FF] text-neutral-950"
                          : "hover:bg-neutral-50/80 text-neutral-700"
                      }`}
                    >
                      <div className="flex gap-3">
                        {thumb ? (
                          <img src={thumb} alt="" className="w-[72px] h-[54px] rounded-md object-cover bg-neutral-100 shrink-0" />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-sans text-neutral-400 tabular-nums">
                              #{String(index + 1).padStart(2, "0")}
                            </span>
                            <span className="text-xs font-sans font-semibold text-[#0047FF] tabular-nums">
                              {dish.trend_score.toFixed(0)}
                            </span>
                          </div>
                          <div className="text-sm font-medium text-neutral-950 leading-snug">
                            {dish.name}
                          </div>
                          {dish.description ? (
                            <p className="text-[11px] text-neutral-500 leading-snug line-clamp-2 mt-1">{dish.description}</p>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Right Selected Dish Evidence & Detail */}
            {selectedDish ? (
              <section className="rounded-xl border border-neutral-200 bg-white p-5 sm:p-6 space-y-6 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-neutral-100">
                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-sans text-neutral-500 uppercase">
                      <span>{selectedDish.momentum} momentum</span>
                      <span>·</span>
                      <span className="tabular-nums">Score {selectedDish.trend_score.toFixed(0)}</span>
                    </div>
                    <h3 className="text-2xl font-light tracking-tight text-neutral-950 mt-1">
                      {selectedDish.name}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void generateCampaign()}
                      disabled={isGenerating}
                      className="rounded-[4px] bg-[#0047FF] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#0038df] transition shadow-xs flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        {generation.jobs.campaign.status === "queued"
                          ? "Queued…"
                          : isGenerating
                            ? "Generating…"
                            : "Generate Launch Campaign →"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={onUseInKitchen}
                      className="border border-neutral-300 rounded-[4px] px-3 py-1.5 text-xs text-neutral-900 bg-white hover:bg-neutral-50 transition shadow-2xs font-sans inline-flex items-center gap-1.5"
                    >
                      <UtensilsCrossed className="w-3.5 h-3.5 text-neutral-600" />
                      <span>Match in Inventory →</span>
                    </button>
                  </div>
                </div>

                {enrichNotice && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-[#0047FF] font-sans flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#0047FF] shrink-0" />
                    <span>{enrichNotice}</span>
                  </div>
                )}

                {enrichError && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-sans">
                    {enrichError}
                  </div>
                )}
                {generation.jobs.analyze.error ? (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-sans">
                    {generation.jobs.analyze.error}
                  </div>
                ) : null}
                {generation.jobs.campaign.error ? (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-sans">
                    {generation.jobs.campaign.error}
                  </div>
                ) : null}

                {(selectedDish.description || selectedDish.why_trending?.summary) && (
                  <p className="text-sm text-neutral-600 leading-relaxed font-light">
                    {selectedDish.description || selectedDish.why_trending?.summary}
                  </p>
                )}

                {selectedDish.recipe &&
                (selectedDish.recipe.ingredients.length || selectedDish.recipe.method.length) ? (
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-4">
                    <div className="text-[11px] font-sans uppercase tracking-wider text-neutral-400">Recipe</div>
                    {selectedDish.recipe.ingredients.length ? (
                      <div>
                        <div className="text-xs text-neutral-500 mb-2">Ingredients</div>
                        <ul className="space-y-1 text-sm text-neutral-800">
                          {selectedDish.recipe.ingredients.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {selectedDish.recipe.method.length ? (
                      <div>
                        <div className="text-xs text-neutral-500 mb-2">Method</div>
                        <ol className="space-y-1.5 text-sm text-neutral-800 list-decimal pl-4">
                          {selectedDish.recipe.method.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* 4 Micro Metric Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatTile label="Mentions" value={String(selectedDish.metrics?.mention_count ?? "—")} />
                  <StatTile label="Local Pulse" value={String(selectedDish.metrics?.local_mention_count ?? "—")} />
                  <StatTile
                    label="Total Reach"
                    value={compactNumber(selectedDish.metrics?.total_engagement)}
                  />
                  <StatTile
                    label="Positive Sentiment"
                    value={
                      selectedDish.metrics?.sentiment?.positive != null
                        ? `${Math.round(selectedDish.metrics.sentiment.positive * 100)}%`
                        : "—"
                    }
                  />
                </div>

                {selectedDish.why_trending?.drivers?.length ? (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-sans uppercase tracking-wider text-neutral-400">
                      Core Demand Drivers
                    </div>
                    <ul className="space-y-1 text-xs text-neutral-600">
                      {selectedDish.why_trending.drivers.map((driver) => (
                        <li key={driver} className="flex items-start gap-2">
                          <span className="text-[#0047FF] font-bold">•</span>
                          <span>{driver}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* AI Synthesis Callout if analysis exists */}
                {currentAnalysis && (
                  <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-sans text-neutral-500 uppercase">
                      <span className="text-[#0047FF] font-semibold">Autonomous Signal Synthesis</span>
                      <span>Gemini 1.5 Flash</span>
                    </div>
                    <p className="text-xs text-neutral-800 leading-relaxed whitespace-pre-wrap font-sans">
                      {currentAnalysis}
                    </p>
                  </div>
                )}

                {/* Evidence Feed */}
                <div>
                  <div className="text-[11px] font-sans uppercase tracking-wider text-neutral-400 mb-3 flex items-center justify-between">
                    <span>Scraped Social Evidence</span>
                    <span className="tabular-nums">{activeEvidence.length} Observed Signals</span>
                  </div>
                  <div className="space-y-3">
                    {activeEvidence.map((item, index) => (
                      <article
                        key={`${item.url}-${index}`}
                        className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 space-y-2 hover:border-neutral-300 transition"
                      >
                        <div className="flex items-center justify-between gap-3 text-[11px] font-sans text-neutral-500">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-neutral-800 uppercase text-[10px] tracking-wider">
                              {item.source.replaceAll("_", " ")}
                            </span>
                            {item.isLive && (
                              <span className="text-[10px] text-[#0047FF] font-medium">· Real-time Verified</span>
                            )}
                          </div>
                          <span className="tabular-nums">{compactNumber(item.engagement)} Views / Engagements</span>
                        </div>
                        <p className="text-xs text-neutral-700 leading-relaxed font-sans">
                          &ldquo;{item.excerpt}&rdquo;
                        </p>
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-sans text-[#0047FF] hover:underline"
                          >
                            View Original Post <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              </section>
            ) : (
              <div className="rounded-xl border border-dashed border-neutral-300 p-12 text-center text-xs text-neutral-400 font-sans">
                Select a scraped dish from the left ledger to inspect its demand signals.
              </div>
            )}
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* MODE 2: CAMPAIGN VIEW */}
      {/* ========================================================================= */}
      {activeMode === "campaign" && (
        <section className="space-y-6">
          {/* Header & Campaign Actions */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-neutral-100">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-sans text-neutral-500">
                <span className="text-[#0047FF] font-semibold uppercase tracking-wider">
                  4-Channel Launch Playbook
                </span>
                <span>·</span>
                <span>Calibrated to <span className="text-[#0047FF] font-semibold tabular-nums">$7,200</span> Monthly Envelope</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-light tracking-tight text-neutral-950 mt-1">
                {parsedPlaybook.dishName}
              </h2>
              <p className="text-xs text-neutral-500 mt-1 max-w-2xl font-light">
                High-velocity creative playbooks formatted for TikTok <span className="text-[#0047FF] font-semibold tabular-nums">9s</span> fast cuts, Instagram ASMR hooks, hyper-local Facebook ads, and VIP influencer outreach.
              </p>
              {generation.jobs.campaign.status === "queued" ? (
                <p className="text-xs text-[#0047FF] mt-2">Campaign is queued. You can leave this tab — the playbook will be here when it finishes.</p>
              ) : generation.jobs.campaign.status === "running" ? (
                <p className="text-xs text-[#0047FF] mt-2">Writing the playbook. You can leave this tab and come back for the output.</p>
              ) : generation.jobs.campaign.error ? (
                <p className="text-xs text-rose-600 mt-2">{generation.jobs.campaign.error}</p>
              ) : null}
            </div>

            {/* Action Buttons Toolbar */}
            <div className="flex flex-wrap items-center gap-2 self-start md:self-end">
              {/* Dish Quick-Picker */}
              {dishes.length > 0 && (
                <div className="relative">
                  <select
                    value={selectedDish?.id || ""}
                    onChange={(e) => {
                      const d = dishes.find((item) => item.id === e.target.value);
                      if (d) onSelectDish(d);
                    }}
                    className="appearance-none bg-white border border-neutral-200 rounded-[4px] pl-2.5 pr-7 py-1.5 text-xs text-neutral-800 font-sans focus:outline-none focus:border-[#0047FF] shadow-2xs"
                  >
                    {dishes.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              )}

              {/* View Mode Switcher */}
              <div className="flex items-center border border-neutral-200 rounded-[4px] p-0.5 bg-neutral-100 text-[11px] font-sans">
                <button
                  type="button"
                  onClick={() => setCampaignViewMode("cards")}
                  className={`px-2.5 py-1 rounded-[2px] transition ${
                    campaignViewMode === "cards" ? "bg-white text-neutral-950 shadow-2xs font-semibold" : "text-neutral-500"
                  }`}
                >
                  Cards
                </button>
                <button
                  type="button"
                  onClick={() => setCampaignViewMode("raw")}
                  className={`px-2.5 py-1 rounded-[2px] transition ${
                    campaignViewMode === "raw" ? "bg-white text-neutral-950 shadow-2xs font-semibold" : "text-neutral-500"
                  }`}
                >
                  Raw Markdown
                </button>
                <button
                  type="button"
                  onClick={() => setCampaignViewMode("edit")}
                  className={`px-2.5 py-1 rounded-[2px] transition inline-flex items-center gap-1 ${
                    campaignViewMode === "edit" ? "bg-white text-neutral-950 shadow-2xs font-semibold" : "text-neutral-500"
                  }`}
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Edit Copy</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  const fullText =
                    currentPlaybookText ||
                    `### 4-Channel Launch Playbook: ${parsedPlaybook.dishName}

#### 1. Instagram Reels (Visual ASMR Hook)
• Visual Hook (0–2s): ${parsedPlaybook.instagram.hook}
• Audio Pairing: ${parsedPlaybook.instagram.audio}
• Caption & Hashtags:
  "${parsedPlaybook.instagram.caption}
  ${parsedPlaybook.instagram.hashtags.join(" ")}"

#### 2. TikTok 9-Second Fast Cut
• Cut Sequence:
${parsedPlaybook.tiktok.map((c) => `  - ${c.time}: ${c.action}`).join("\n")}

#### 3. Hyper-Local Facebook Community Ad
• Headline: ${parsedPlaybook.facebook.headline}
• Angle: ${parsedPlaybook.facebook.angle}
• Call to Action: "${parsedPlaybook.facebook.cta}"

#### 4. Local Foodie Influencer DM Pitch
• "${parsedPlaybook.influencer.pitch}"
`;
                  copyToClipboard(fullText, "all");
                }}
                className="border border-neutral-300 rounded-[4px] px-3 py-1.5 text-xs text-neutral-900 bg-white hover:bg-neutral-50 transition shadow-2xs font-sans inline-flex items-center gap-1.5"
              >
                {copiedKey === "all" ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Playbook</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={downloadReport}
                className="border border-neutral-300 rounded-[4px] px-3 py-1.5 text-xs text-neutral-900 bg-white hover:bg-neutral-50 transition shadow-2xs font-sans inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .md</span>
              </button>

              <button
                type="button"
                onClick={() => void generateCampaign()}
                disabled={isGenerating}
                className="rounded-[4px] bg-[#0047FF] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#0038df] transition shadow-xs flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} />
                <span>
                  {generation.jobs.campaign.status === "queued"
                    ? "Queued…"
                    : isGenerating
                      ? "Generating…"
                      : "Regenerate"}
                </span>
              </button>
            </div>
          </div>

          {/* VIEW MODE: EDIT */}
          {campaignViewMode === "edit" ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-6 space-y-5 shadow-2xs font-sans">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-950">Customize Launch Playbook Copy</h3>
                  <p className="text-xs text-neutral-500 mt-0.5">Refine scripts and messaging before sharing or downloading.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCampaignViewMode("cards")}
                    className="px-3 py-1.5 rounded-[4px] border border-neutral-200 text-xs text-neutral-700 hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEditedPlaybook}
                    className="px-3.5 py-1.5 rounded-[4px] bg-[#0047FF] hover:bg-[#0038df] text-xs font-medium text-white shadow-xs"
                  >
                    Save Changes
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
                <div className="space-y-3 p-4 rounded-lg bg-neutral-50 border border-neutral-200/80">
                  <span className="font-semibold text-neutral-900 block text-[11px] uppercase tracking-wider text-[#0047FF]">
                    Instagram Reels
                  </span>
                  <div>
                    <label className="block text-neutral-600 mb-1 font-medium">Visual Hook (0–2s)</label>
                    <input
                      type="text"
                      value={editIgHook}
                      onChange={(e) => setEditIgHook(e.target.value)}
                      className="w-full bg-white border border-neutral-300 rounded p-2 text-neutral-950 outline-none focus:border-[#0047FF]"
                    />
                  </div>
                  <div>
                    <label className="block text-neutral-600 mb-1 font-medium">Caption &amp; Call To Action</label>
                    <textarea
                      rows={4}
                      value={editIgCaption}
                      onChange={(e) => setEditIgCaption(e.target.value)}
                      className="w-full bg-white border border-neutral-300 rounded p-2 text-neutral-950 outline-none focus:border-[#0047FF]"
                    />
                  </div>
                </div>

                <div className="space-y-3 p-4 rounded-lg bg-neutral-50 border border-neutral-200/80">
                  <span className="font-semibold text-neutral-900 block text-[11px] uppercase tracking-wider text-[#0047FF]">
                    Facebook Local Ad
                  </span>
                  <div>
                    <label className="block text-neutral-600 mb-1 font-medium">Headline</label>
                    <input
                      type="text"
                      value={editFbHeadline}
                      onChange={(e) => setEditFbHeadline(e.target.value)}
                      className="w-full bg-white border border-neutral-300 rounded p-2 text-neutral-950 outline-none focus:border-[#0047FF]"
                    />
                  </div>
                  <div>
                    <label className="block text-neutral-600 mb-1 font-medium">Value Angle</label>
                    <input
                      type="text"
                      value={editFbAngle}
                      onChange={(e) => setEditFbAngle(e.target.value)}
                      className="w-full bg-white border border-neutral-300 rounded p-2 text-neutral-950 outline-none focus:border-[#0047FF]"
                    />
                  </div>
                  <div>
                    <label className="block text-neutral-600 mb-1 font-medium">Call to Action (CTA)</label>
                    <input
                      type="text"
                      value={editFbCta}
                      onChange={(e) => setEditFbCta(e.target.value)}
                      className="w-full bg-white border border-neutral-300 rounded p-2 text-neutral-950 outline-none focus:border-[#0047FF]"
                    />
                  </div>
                </div>

                <div className="md:col-span-2 space-y-2 p-4 rounded-lg bg-neutral-50 border border-neutral-200/80">
                  <span className="font-semibold text-neutral-900 block text-[11px] uppercase tracking-wider text-[#0047FF]">
                    Foodie Influencer VIP DM Script
                  </span>
                  <textarea
                    rows={3}
                    value={editDmPitch}
                    onChange={(e) => setEditDmPitch(e.target.value)}
                    className="w-full bg-white border border-neutral-300 rounded p-2 text-neutral-950 outline-none focus:border-[#0047FF]"
                  />
                </div>
              </div>
            </div>
          ) : campaignViewMode === "raw" ? (
            <pre className="p-5 rounded-xl border border-neutral-200 bg-neutral-50 font-sans text-xs text-neutral-800 leading-relaxed overflow-x-auto whitespace-pre-wrap">
              {currentPlaybookText ||
                `### 4-Channel Launch Playbook: ${parsedPlaybook.dishName}

#### 1. Instagram Reels (Visual ASMR Hook)
• Visual Hook (0–2s): ${parsedPlaybook.instagram.hook}
• Audio Pairing: ${parsedPlaybook.instagram.audio}
• Caption & Hashtags:
  "${parsedPlaybook.instagram.caption}
  ${parsedPlaybook.instagram.hashtags.join(" ")}"

#### 2. TikTok 9-Second Fast Cut
• Cut Sequence:
${parsedPlaybook.tiktok.map((c) => `  - ${c.time}: ${c.action}`).join("\n")}

#### 3. Hyper-Local Facebook Community Ad
• Headline: ${parsedPlaybook.facebook.headline}
• Angle: ${parsedPlaybook.facebook.angle}
• Call to Action: "${parsedPlaybook.facebook.cta}"

#### 4. Local Foodie Influencer DM Pitch
• "${parsedPlaybook.influencer.pitch}"
`}
            </pre>
          ) : (
            /* VIEW MODE: STRUCTURED CARDS */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* CARD 1: INSTAGRAM REELS */}
              <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4 shadow-2xs hover:border-neutral-300 transition flex flex-col justify-between font-sans">
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-[4px] border border-neutral-200 bg-neutral-50 flex items-center justify-center text-neutral-800 shrink-0">
                        <Instagram className="w-3.5 h-3.5" />
                      </span>
                      <div>
                        <span className="text-[10px] font-sans text-[#0047FF] font-semibold uppercase tracking-wider block">
                          Channel 01 · Instagram Reels
                        </span>
                        <h4 className="text-sm font-semibold text-neutral-900">
                          Visual ASMR Hook &amp; Recipe Reveal
                        </h4>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          `${parsedPlaybook.instagram.caption}\n\n${parsedPlaybook.instagram.hashtags.join(" ")}`,
                          "ig",
                        )
                      }
                      className="rounded-[4px] border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:text-neutral-900 bg-white hover:bg-neutral-50 transition shadow-2xs font-sans inline-flex items-center gap-1.5"
                      title="Copy Instagram Caption"
                    >
                      {copiedKey === "ig" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === "ig" ? "Copied" : "Copy Caption"}</span>
                    </button>
                  </div>

                  {/* Hook & Audio */}
                  <div className="space-y-3 font-sans">
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-medium">
                        Visual Hook (<span className="text-[#0047FF] font-semibold tabular-nums">0–2s</span>)
                      </div>
                      <p className="text-xs text-neutral-800 leading-relaxed font-normal">
                        {parsedPlaybook.instagram.hook}
                      </p>
                    </div>

                    <div className="pt-2.5 border-t border-neutral-100 space-y-1">
                      <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-medium">
                        Audio Pairing
                      </div>
                      <p className="text-xs text-neutral-700 font-normal">
                        {parsedPlaybook.instagram.audio}
                      </p>
                    </div>

                    <div className="pt-2.5 border-t border-neutral-100 space-y-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-medium">
                        Post Caption &amp; Call To Action
                      </div>
                      <div className="p-3.5 rounded-lg bg-neutral-50/70 border border-neutral-200/80 text-xs text-neutral-800 leading-relaxed font-sans border-l-2 border-l-[#0047FF]">
                        &ldquo;{parsedPlaybook.instagram.caption}&rdquo;
                      </div>
                    </div>
                  </div>
                </div>

                {/* Hashtags */}
                <div className="pt-3 border-t border-neutral-100 flex flex-wrap gap-2 text-xs font-sans">
                  {parsedPlaybook.instagram.hashtags.map((tag) => (
                    <span key={tag} className="text-neutral-500 font-medium">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* CARD 2: TIKTOK 9-SECOND FAST CUT */}
              <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4 shadow-2xs hover:border-neutral-300 transition flex flex-col justify-between font-sans">
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-[4px] border border-neutral-200 bg-neutral-50 flex items-center justify-center text-neutral-800 shrink-0">
                        <Video className="w-3.5 h-3.5" />
                      </span>
                      <div>
                        <span className="text-[10px] font-sans text-[#0047FF] font-semibold uppercase tracking-wider block">
                          Channel 02 · TikTok Algorithm
                        </span>
                        <h4 className="text-sm font-semibold text-neutral-900">
                          9-Second Fast Cut Retention Sequence
                        </h4>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          parsedPlaybook.tiktok.map((c) => `${c.time}: ${c.action}`).join("\n"),
                          "tiktok",
                        )
                      }
                      className="rounded-[4px] border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:text-neutral-900 bg-white hover:bg-neutral-50 transition shadow-2xs font-sans inline-flex items-center gap-1.5"
                      title="Copy Timeline Cut"
                    >
                      {copiedKey === "tiktok" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === "tiktok" ? "Copied" : "Copy Steps"}</span>
                    </button>
                  </div>

                  <p className="text-xs text-neutral-500 font-light">
                    Engineered to trigger loop re-watches and maximum <span className="text-[#0047FF] font-semibold tabular-nums">100%</span> completion rate.
                  </p>

                  {/* Clean Step Timeline without black badges */}
                  <div className="border border-neutral-200 rounded-lg overflow-hidden divide-y divide-neutral-100">
                    {parsedPlaybook.tiktok.map((step, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 px-3.5 py-2.5 bg-white hover:bg-neutral-50/50 transition text-xs font-sans"
                      >
                        <span className="text-xs font-semibold text-[#0047FF] tabular-nums shrink-0 w-20">
                          {step.time}
                        </span>
                        <span className="text-neutral-800 leading-normal flex-1">{step.action}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-[11px] font-sans text-neutral-400">
                  <span>
                    Pacing: <span className="text-[#0047FF] font-semibold tabular-nums">4</span> rapid scene cuts
                  </span>
                  <span>
                    Target Loop Rate: <span className="text-[#0047FF] font-semibold tabular-nums">&gt;74%</span>
                  </span>
                </div>
              </div>

              {/* CARD 3: FACEBOOK COMMUNITY AD */}
              <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4 shadow-2xs hover:border-neutral-300 transition flex flex-col justify-between font-sans">
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-[4px] border border-neutral-200 bg-neutral-50 flex items-center justify-center text-neutral-800 shrink-0">
                        <Megaphone className="w-3.5 h-3.5" />
                      </span>
                      <div>
                        <span className="text-[10px] font-sans text-[#0047FF] font-semibold uppercase tracking-wider block">
                          Channel 03 · Facebook Local
                        </span>
                        <h4 className="text-sm font-semibold text-neutral-900">
                          Hyper-Local Community Feed Sponsor
                        </h4>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          `Headline: ${parsedPlaybook.facebook.headline}\nAngle: ${parsedPlaybook.facebook.angle}\nCall to Action: ${parsedPlaybook.facebook.cta}`,
                          "fb",
                        )
                      }
                      className="rounded-[4px] border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:text-neutral-900 bg-white hover:bg-neutral-50 transition shadow-2xs font-sans inline-flex items-center gap-1.5"
                      title="Copy Ad Copy"
                    >
                      {copiedKey === "fb" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === "fb" ? "Copied" : "Copy Ad"}</span>
                    </button>
                  </div>

                  {/* Headline & Angle */}
                  <div className="space-y-3 font-sans">
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-medium">
                        Primary Headline
                      </div>
                      <p className="text-xs font-medium text-neutral-900 leading-relaxed">
                        {parsedPlaybook.facebook.headline}
                      </p>
                    </div>

                    <div className="pt-2.5 border-t border-neutral-100 space-y-1">
                      <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-medium">
                        Value Angle
                      </div>
                      <p className="text-xs text-neutral-700 leading-relaxed">
                        {parsedPlaybook.facebook.angle}
                      </p>
                    </div>

                    <div className="pt-2.5 border-t border-neutral-100 space-y-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-medium">
                        Conversion CTA
                      </div>
                      <div className="p-3.5 rounded-lg bg-neutral-50/70 border border-neutral-200/80 text-xs font-semibold text-[#0047FF] leading-relaxed">
                        &ldquo;{parsedPlaybook.facebook.cta}&rdquo;
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-[11px] font-sans text-neutral-400">
                  <span>
                    Geo Radius: <span className="text-[#0047FF] font-semibold tabular-nums">5</span>-Mile Dining Zone
                  </span>
                  <span>
                    Sized within Paid Social Cap (<span className="text-[#0047FF] font-semibold tabular-nums">$3,024</span>)
                  </span>
                </div>
              </div>

              {/* CARD 4: INFLUENCER VIP DM */}
              <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4 shadow-2xs hover:border-neutral-300 transition flex flex-col justify-between font-sans">
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-[4px] border border-neutral-200 bg-neutral-50 flex items-center justify-center text-neutral-800 shrink-0">
                        <MessageCircle className="w-3.5 h-3.5" />
                      </span>
                      <div>
                        <span className="text-[10px] font-sans text-[#0047FF] font-semibold uppercase tracking-wider block">
                          Channel 04 · Creator Outreach
                        </span>
                        <h4 className="text-sm font-semibold text-neutral-900">
                          Local Foodie Influencer VIP DM Pitch
                        </h4>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(parsedPlaybook.influencer.pitch, "dm")}
                      className="rounded-[4px] border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:text-neutral-900 bg-white hover:bg-neutral-50 transition shadow-2xs font-sans inline-flex items-center gap-1.5"
                      title="Copy DM Script"
                    >
                      {copiedKey === "dm" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === "dm" ? "Copied" : "Copy DM Pitch"}</span>
                    </button>
                  </div>

                  <p className="text-xs text-neutral-500 font-light">
                    Direct outreach copy personalized for top food reviewers in your metro radius.
                  </p>

                  <div className="p-4 rounded-lg bg-neutral-50/70 border border-neutral-200/80 text-xs text-neutral-800 leading-relaxed font-sans border-l-2 border-l-[#0047FF]">
                    &ldquo;{parsedPlaybook.influencer.pitch}&rdquo;
                  </div>
                </div>

                <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-[11px] font-sans text-neutral-400">
                  <span>
                    Cap: Max <span className="text-[#0047FF] font-semibold tabular-nums">4</span> Creators (<span className="text-[#0047FF] font-semibold tabular-nums">$1,440</span>)
                  </span>
                  <span>
                    Avg: <span className="text-[#0047FF] font-semibold tabular-nums">~$360</span> / Dedicated Reel
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Navigation Toolbar */}
          <div className="pt-4 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={onNavigateToDiscover}
              className="text-xs text-neutral-600 hover:text-neutral-950 font-sans inline-flex items-center gap-1.5"
            >
              <span>← Back to Demand Radar &amp; Discover</span>
            </button>

            <button
              type="button"
              onClick={onUseInKitchen}
              className="rounded-[4px] bg-[#0047FF] hover:bg-[#0038df] text-white px-4 py-2 text-xs font-medium transition shadow-xs inline-flex items-center gap-2"
            >
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span>Verify Inventory Stock →</span>
            </button>
          </div>
        </section>
      )}

      {/* ENGINE SETTINGS MODAL */}
      {showSettings && mounted && createPortal(
        <div
          className="fixed inset-0 z-[999] bg-neutral-950/40 backdrop-blur-md flex items-center justify-center p-4 transition-all"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSettings(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 space-y-4 shadow-2xl font-sans border-0">
            <div className="flex items-center justify-between pb-1">
              <h3 className="text-base font-semibold text-neutral-950">AI Inference Engine</h3>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block text-xs font-sans text-neutral-600">
              Model Engine
              <select
                value={engine}
                onChange={(event) => setEngine(event.target.value as Engine)}
                className="mt-1 w-full rounded-[4px] border border-neutral-300 bg-white p-2 text-xs text-neutral-950 outline-none"
              >
                <option value="gemini">Gemini 1.5 Flash (Recommended)</option>
                <option value="backboard">Backboard Culinary Model</option>
              </select>
            </label>
            <label className="block text-xs font-sans text-neutral-600">
              Optional API Key
              <input
                type="password"
                value={customKey}
                onChange={(event) => setCustomKey(event.target.value)}
                placeholder="Leave blank to use environment default"
                className="mt-1 w-full rounded-[4px] border border-neutral-300 bg-white p-2 text-xs text-neutral-950 placeholder-neutral-400 outline-none"
              />
            </label>
            <p className="text-[11px] text-neutral-500 inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Defaults to preconfigured production environment credentials.
            </p>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="w-full rounded-[4px] bg-[#0047FF] hover:bg-[#0038df] py-2 text-xs font-medium text-white transition shadow-xs"
            >
              Save &amp; Close
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50/60 px-3.5 py-2.5 font-sans">
      <div className="text-[10px] font-sans uppercase tracking-wider text-neutral-400">{label}</div>
      <div className="mt-0.5 text-base font-semibold font-sans tabular-nums text-[#0047FF]">{value}</div>
    </div>
  );
}
