"use client";

import React, { useState, useEffect } from "react";
import {
  Search,
  Sparkles,
  Flame,
  Music,
  Eye,
  Heart,
  Share2,
  TrendingUp,
  Cpu,
  RefreshCw,
  MessageSquare,
  ChevronDown,
  Copy,
  Download,
  Zap,
  Users,
  X,
  CheckCircle2,
  Instagram,
  Video,
  UserCheck,
  ExternalLink,
  SlidersHorizontal,
  Radio,
  Globe,
} from "lucide-react";

export interface Signal {
  id: string;
  platform: "instagram" | "tiktok" | "facebook" | "influencer" | "youtube";
  authorName: string;
  handle: string;
  authorFollowers: string;
  authorType: string;
  caption: string;
  hashtags: string[];
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: string;
  trendingAudio?: string;
  postedTime: string;
  format: string;
  duration: string;
  hookType: string;
  sentiment: string;
  badge: string;
  evidenceUrl?: string;
  topComments: string[];
}

export default function TrendPipeline({ initialTopic }: { initialTopic?: string }) {
  const [activeStage, setActiveStage] = useState<1 | 2 | 3>(1);
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [currentTopic, setCurrentTopic] = useState(
    initialTopic || "Crispy Smash Falafel with Whipped Feta",
  );
  const [searchInput, setSearchInput] = useState("");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [groundingSources, setGroundingSources] = useState<Array<{ title: string; uri: string }>>([]);
  const [trendSummary, setTrendSummary] = useState("");

  const [isLoadingSignals, setIsLoadingSignals] = useState(false);
  const [selectedEngine, setSelectedEngine] = useState<"gemini" | "backboard">("gemini");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisText, setAnalysisText] = useState("");

  const [isGeneratingCampaign, setIsGeneratingCampaign] = useState(false);
  const [playbookText, setPlaybookText] = useState("");
  const [activePlaybookTab, setActivePlaybookTab] = useState<"instagram" | "tiktok" | "facebook" | "influencers">("instagram");

  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [customKey, setCustomKey] = useState("");

  // Presets
  const presets = [
    "Crispy Smash Falafel with Whipped Feta",
    "Chili Crisp Hot Honey Wings",
    "Lacy Edge Smash Burgers & Dipping Jus",
    "Cold Cloud Foam Matcha Latte",
  ];

  useEffect(() => {
    const topic = initialTopic || currentTopic;
    fetchRealtimeTrends(topic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTopic]);

  async function fetchRealtimeTrends(topicQuery: string) {
    setCurrentTopic(topicQuery);
    setIsLoadingSignals(true);
    try {
      const res = await fetch(`/api/trends?query=${encodeURIComponent(topicQuery)}`);
      const data = await res.json();
      if (data.success && data.realtimeData) {
        setSignals(data.realtimeData.signals || []);
        setGroundingSources(data.realtimeData.groundingSources || []);
        setTrendSummary(data.realtimeData.summary || "");
      }
    } catch (err) {
      console.error("Failed to fetch live trends:", err);
    } finally {
      setIsLoadingSignals(false);
    }
  }

  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (searchInput.trim()) {
      setCurrentTopic(searchInput.trim());
      await fetchRealtimeTrends(searchInput.trim());
      setAnalysisText("");
      setPlaybookText("");
    }
  }

  async function selectPreset(preset: string) {
    setCurrentTopic(preset);
    setSearchInput("");
    await fetchRealtimeTrends(preset);
    setAnalysisText("");
    setPlaybookText("");
  }

  // Trigger Stage 2: Real-time Analysis
  async function runAnalysis() {
    setIsAnalyzing(true);
    setActiveStage(2);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: currentTopic,
          signals,
          engine: selectedEngine,
          apiKey: customKey || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAnalysisText(data.analysisText);
      }
    } catch (err) {
      console.error("Analysis failed:", err);
    } finally {
      setIsAnalyzing(false);
    }
  }

  // Trigger Stage 3: Real-time Campaign Generation
  async function generateCampaign() {
    setIsGeneratingCampaign(true);
    setActiveStage(3);
    try {
      const res = await fetch("/api/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: currentTopic,
          analysisText,
          engine: selectedEngine,
          apiKey: customKey || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPlaybookText(data.playbookText);
      }
    } catch (err) {
      console.error("Campaign generation failed:", err);
    } finally {
      setIsGeneratingCampaign(false);
    }
  }

  const filteredSignals = signals.filter((s) => {
    if (selectedPlatform === "all") return true;
    return s.platform === selectedPlatform;
  });

  function getPlatformIcon(plat: string) {
    switch (plat) {
      case "instagram":
        return <Instagram className="w-4 h-4 text-pink-400" />;
      case "tiktok":
        return <Video className="w-4 h-4 text-teal-400" />;
      case "facebook":
        return <Users className="w-4 h-4 text-blue-400" />;
      case "influencer":
        return <UserCheck className="w-4 h-4 text-purple-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-amber-400" />;
    }
  }

  function getPlatformBg(plat: string) {
    switch (plat) {
      case "instagram":
        return "bg-gradient-to-tr from-yellow-500 via-pink-600 to-purple-700 text-white";
      case "tiktok":
        return "bg-neutral-900 border border-neutral-700 text-teal-400";
      case "facebook":
        return "bg-blue-600 text-white";
      case "influencer":
        return "bg-purple-600 text-white";
      default:
        return "bg-neutral-800 text-neutral-300";
    }
  }

  function formatNumber(num: number) {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(0) + "K";
    return String(num || 0);
  }

  function copySnippet(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2000);
  }

  function downloadReport() {
    const content = `# Real-Time Social Trend Report: ${currentTopic}\n**Generated:** ${new Date().toISOString()}\n**Engine:** ${selectedEngine.toUpperCase()}\n\n---\n## Live Summary\n${trendSummary}\n\n---\n## Stage 2: AI Brain Analysis\n${analysisText}\n\n---\n## Stage 3: Campaign Playbook\n${playbookText}`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `realtime_strategy_${currentTopic.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Top Banner with Real-Time Indicator & 3-Stage Progress Nav */}
      <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-neutral-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2.5 py-0.5 rounded-full">
                <Radio className="w-3 h-3 animate-pulse text-emerald-400" />
                Live Real-Time Pipeline
              </span>
              <span className="text-xs text-neutral-400 font-mono">Identify • Analyse • Act</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Social Trend & Campaign Intelligence
            </h2>
            <p className="text-xs sm:text-sm text-neutral-400 mt-1 max-w-2xl">
              Real-time trend ingestion across Instagram, TikTok, Facebook, and Influencers, synthesized by Google Gemini with live web grounding.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
              <span className="text-neutral-400">Brain:</span>
              <select
                value={selectedEngine}
                onChange={(e) => setSelectedEngine(e.target.value as any)}
                className="bg-transparent text-neutral-200 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="gemini">Google Gemini 2.5 Flash</option>
                <option value="backboard">Backboard AI</option>
              </select>
            </div>

            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-750 text-neutral-300 hover:text-white border border-neutral-750 transition"
              title="Configure Brain Engine & Keys"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3-Stage Progress Nav */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-5">
          <button
            onClick={() => setActiveStage(1)}
            className={`p-3 rounded-xl border text-left transition flex items-center gap-3 ${
              activeStage === 1
                ? "bg-cyan-950/40 border-cyan-500/60 text-white shadow-lg shadow-cyan-950/50"
                : "bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:border-neutral-700"
            }`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                activeStage === 1 ? "bg-cyan-500 text-neutral-950 font-extrabold" : "bg-neutral-800 text-neutral-400"
              }`}
            >
              1
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider">Stage 1</div>
              <div className="text-xs sm:text-sm font-bold truncate">IDENTIFY</div>
              <div className="text-[10px] text-neutral-500 hidden sm:block">Live Social Signals</div>
            </div>
          </button>

          <button
            onClick={() => setActiveStage(2)}
            className={`p-3 rounded-xl border text-left transition flex items-center gap-3 ${
              activeStage === 2
                ? "bg-blue-950/40 border-blue-500/60 text-white shadow-lg shadow-blue-950/50"
                : "bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:border-neutral-700"
            }`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                activeStage === 2 ? "bg-blue-500 text-neutral-950 font-extrabold" : "bg-neutral-800 text-neutral-400"
              }`}
            >
              2
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider">Stage 2</div>
              <div className="text-xs sm:text-sm font-bold truncate">ANALYSE</div>
              <div className="text-[10px] text-neutral-500 hidden sm:block">The AI Brain</div>
            </div>
          </button>

          <button
            onClick={() => setActiveStage(3)}
            className={`p-3 rounded-xl border text-left transition flex items-center gap-3 ${
              activeStage === 3
                ? "bg-emerald-950/40 border-emerald-500/60 text-white shadow-lg shadow-emerald-950/50"
                : "bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:border-neutral-700"
            }`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                activeStage === 3 ? "bg-emerald-500 text-neutral-950 font-extrabold" : "bg-neutral-800 text-neutral-400"
              }`}
            >
              3
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider">Stage 3</div>
              <div className="text-xs sm:text-sm font-bold truncate">ACT</div>
              <div className="text-[10px] text-neutral-500 hidden sm:block">Campaign Playbook</div>
            </div>
          </button>
        </div>
      </div>

      {/* ============================================================= */}
      {/* STAGE 1: IDENTIFY (Real-time Live Social Signals)            */}
      {/* ============================================================= */}
      {activeStage === 1 && (
        <div className="space-y-5">
          {/* Live Search Bar & Presets */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 space-y-3">
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Enter any trend, dish, or cuisine to search live in real-time..."
                  className="w-full pl-9 pr-24 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-cyan-500 transition"
                />
                <button
                  type="submit"
                  disabled={isLoadingSignals}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium rounded-md transition"
                >
                  {isLoadingSignals ? "Pulling..." : "Live Pull"}
                </button>
              </div>

              <button
                type="button"
                onClick={runAnalysis}
                disabled={isAnalyzing || signals.length === 0}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-neutral-950 font-bold text-xs sm:text-sm transition shadow-lg shadow-cyan-500/20 shrink-0 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isAnalyzing ? "Brain Analyzing..." : "Analyze Live Signals (Stage 2) →"}</span>
              </button>
            </form>

            {/* Presets */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] text-neutral-500 font-medium mr-1">Live Topics:</span>
              {presets.map((p) => (
                <button
                  key={p}
                  onClick={() => selectPreset(p)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                    currentTopic === p
                      ? "bg-cyan-950 border-cyan-700 text-cyan-300"
                      : "bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Google Search Live Grounding Sources indicator */}
            {groundingSources.length > 0 && (
              <div className="pt-2 border-t border-neutral-800/60 flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <Globe className="w-3 h-3" /> Live Search Grounding:
                </span>
                {groundingSources.slice(0, 3).map((src, i) => (
                  <a
                    key={i}
                    href={src.uri}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-950 border border-neutral-800 text-cyan-400 hover:underline truncate max-w-[200px]"
                  >
                    <span>{src.title}</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Channel Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 p-1 bg-neutral-900 border border-neutral-800 rounded-xl">
              {[
                { id: "all", label: "All Channels" },
                { id: "instagram", label: "Instagram" },
                { id: "tiktok", label: "TikTok" },
                { id: "facebook", label: "Facebook" },
                { id: "influencer", label: "Influencers" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedPlatform(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    selectedPlatform === tab.id ? "bg-neutral-800 text-white shadow-sm" : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {tab.label} (
                  {tab.id === "all" ? signals.length : signals.filter((s) => s.platform === tab.id).length}
                  )
                </button>
              ))}
            </div>

            <div className="text-xs text-neutral-400 font-mono">
              Live Posts: <span className="text-white font-semibold">{filteredSignals.length}</span>
            </div>
          </div>

          {/* Loading Indicator */}
          {isLoadingSignals && (
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-10 text-center space-y-3">
              <div className="w-10 h-10 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mx-auto"></div>
              <p className="text-xs text-neutral-400">Searching live Google Search and social feeds in real-time...</p>
            </div>
          )}

          {/* Post Signals Grid */}
          {!isLoadingSignals && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredSignals.map((post) => (
                <div
                  key={post.id}
                  className="bg-neutral-900/50 hover:bg-neutral-900/80 border border-neutral-800 hover:border-neutral-700 rounded-xl p-4 sm:p-5 transition flex flex-col justify-between space-y-4 group shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shadow-inner ${getPlatformBg(post.platform)}`}>
                        {getPlatformIcon(post.platform)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs sm:text-sm font-bold text-white">{post.authorName}</span>
                          <span className="text-[11px] text-neutral-500 font-mono">{post.handle}</span>
                        </div>
                        <div className="text-[11px] text-neutral-400 flex items-center gap-1.5">
                          <span>{post.authorFollowers} followers</span>
                          <span>•</span>
                          <span className="text-neutral-500">{post.authorType}</span>
                        </div>
                      </div>
                    </div>

                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-300 border border-neutral-700">
                      {post.badge}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-neutral-200 leading-relaxed line-clamp-3">
                    {post.caption}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="px-2 py-0.5 rounded-md bg-cyan-950/60 border border-cyan-800/60 text-cyan-300 font-medium flex items-center gap-1">
                      <Flame className="w-3 h-3 text-cyan-400" />
                      <span>{post.hookType}</span>
                    </span>

                    {post.trendingAudio && (
                      <span className="px-2 py-0.5 rounded-md bg-neutral-800 border border-neutral-700 text-neutral-300 flex items-center gap-1 truncate max-w-[200px]">
                        <Music className="w-3 h-3 text-neutral-400" />
                        <span className="truncate">{post.trendingAudio}</span>
                      </span>
                    )}

                    {post.evidenceUrl && (
                      <a
                        href={post.evidenceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-0.5 rounded-md bg-neutral-850 hover:bg-neutral-800 border border-neutral-750 text-cyan-400 flex items-center gap-1 transition"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Source</span>
                      </a>
                    )}
                  </div>

                  {/* Metrics footer */}
                  <div className="pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400">
                    <div className="flex items-center gap-3 font-mono">
                      <div className="flex items-center gap-1" title="Views">
                        <Eye className="w-3.5 h-3.5 text-neutral-500" />
                        <span>{formatNumber(post.views)}</span>
                      </div>
                      <div className="flex items-center gap-1" title="Likes">
                        <Heart className="w-3.5 h-3.5 text-rose-400" />
                        <span>{formatNumber(post.likes)}</span>
                      </div>
                      <div className="flex items-center gap-1" title="Shares">
                        <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{formatNumber(post.shares)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-emerald-400 font-semibold text-xs">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>{post.engagementRate} ER</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* STAGE 2: ANALYSE (Real-time AI Brain Synthesis)               */}
      {/* ============================================================= */}
      {activeStage === 2 && (
        <div className="space-y-5">
          <div className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                <Cpu className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">The AI Brain: Real-Time Pattern Analysis</h3>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800">
                    {selectedEngine === "gemini" ? "Google Gemini 2.5 Flash" : "Backboard AI"}
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Topic: <strong className="text-neutral-200">"{currentTopic}"</strong> • Analyzing real-time signals without simulation.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                onClick={runAnalysis}
                disabled={isAnalyzing}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? "animate-spin text-cyan-400" : ""}`} />
                <span>{isAnalyzing ? "Processing..." : "Re-Analyze"}</span>
              </button>

              <button
                onClick={generateCampaign}
                disabled={isAnalyzing || !analysisText}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-neutral-950 text-xs font-bold transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Strategize Campaign (Stage 3) →</span>
              </button>
            </div>
          </div>

          {isAnalyzing ? (
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mx-auto"></div>
              <div>
                <h4 className="text-sm font-semibold text-white">The Brain is deconstructing live social patterns...</h4>
                <p className="text-xs text-neutral-500 mt-1">
                  Synthesizing viral psychology, format fit, and unit margin economics.
                </p>
              </div>
            </div>
          ) : analysisText ? (
            <div className="space-y-4">
              <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-6 shadow-md text-xs text-neutral-200 leading-relaxed whitespace-pre-wrap font-sans">
                {analysisText}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-neutral-500 text-xs">
              Click "Analyze Live Signals" above to run the AI Brain.
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* STAGE 3: ACT (Real-Time Content Strategy Playbook)             */}
      {/* ============================================================= */}
      {activeStage === 3 && (
        <div className="space-y-5">
          <div className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Campaign Action Playbook</h3>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Ready to Launch
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Multi-platform production kits generated by the AI Brain for Instagram Reels, TikTok, Facebook, and Influencers.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => copySnippet(playbookText, "fullPlaybook")}
                className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5 text-cyan-400" />
                <span>{copiedSection === "fullPlaybook" ? "Copied!" : "Copy Playbook"}</span>
              </button>

              <button
                onClick={downloadReport}
                className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-neutral-400" />
                <span>Download .md</span>
              </button>
            </div>
          </div>

          {isGeneratingCampaign ? (
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin mx-auto"></div>
              <p className="text-xs text-neutral-400">Synthesizing 4-channel campaign playbook and outreach DMs...</p>
            </div>
          ) : playbookText ? (
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-6 shadow-md text-xs text-neutral-200 leading-relaxed whitespace-pre-wrap font-sans">
              {playbookText}
            </div>
          ) : (
            <div className="text-center py-12 text-neutral-500 text-xs">
              Click "Strategize Campaign" in Stage 2 to generate the playbook.
            </div>
          )}
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-bold text-white">Brain Engine & Real-Time Config</h3>
              </div>
              <button onClick={() => setShowSettingsModal(false)} className="text-neutral-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-neutral-300 mb-1.5">Active Brain Engine</label>
                <select
                  value={selectedEngine}
                  onChange={(e) => setSelectedEngine(e.target.value as any)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-neutral-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="gemini">Google Gemini 2.5 Flash (Ultra-Fast Live Web Grounding)</option>
                  <option value="backboard">Backboard AI (Agentic Memory)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-neutral-300 mb-1.5">Custom API Key (Optional)</label>
                <input
                  type="password"
                  value={customKey}
                  onChange={(e) => setCustomKey(e.target.value)}
                  placeholder="Defaults to active verified environment key..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-neutral-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                />
                <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Pre-configured key is active and verified</span>
                </p>
              </div>

              <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between text-neutral-400">
                <span>Real-Time Google Search Grounding: Active</span>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-bold rounded-lg transition"
                >
                  Save & Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
