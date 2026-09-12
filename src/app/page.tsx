"use client";

import React, { useState } from "react";
import TrendPipeline from "@/components/TrendPipeline";
import OpportunityMatrix from "@/components/OpportunityMatrix";
import CsvStudio from "@/components/CsvStudio";
import { Sparkles, FileSpreadsheet, Zap, Radio, TrendingUp } from "lucide-react";

export default function Home() {
  const [currentView, setCurrentView] = useState<"pipeline" | "opportunities" | "csv">("pipeline");
  const [selectedCampaignDish, setSelectedCampaignDish] = useState<any | null>(null);

  function handleSelectForCampaign(dish: any) {
    setSelectedCampaignDish(dish);
    setCurrentView("pipeline");
  }

  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-100">
      {/* Top Header */}
      <header className="border-b border-neutral-800/80 bg-neutral-900/60 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-white/10">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-white text-lg">MiseEnVue</span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/60 tracking-wider">
                  Full Pipeline & Decision Engine
                </span>
              </div>
            </div>
          </div>

          {/* Center 3-Mode Switcher */}
          <div className="flex items-center gap-1 bg-neutral-950/80 border border-neutral-800 p-1 rounded-xl shadow-inner">
            <button
              onClick={() => setCurrentView("pipeline")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                currentView === "pipeline"
                  ? "bg-neutral-800 text-white shadow-sm border border-neutral-700/60"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Live Pipeline</span>
            </button>

            <button
              onClick={() => setCurrentView("opportunities")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                currentView === "opportunities"
                  ? "bg-neutral-800 text-white shadow-sm border border-neutral-700/60"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>Opportunity Matrix (Decisions)</span>
            </button>

            <button
              onClick={() => setCurrentView("csv")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                currentView === "csv"
                  ? "bg-neutral-800 text-white shadow-sm border border-neutral-700/60"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
              <span>CSV & Inventory Studio</span>
            </button>
          </div>

          {/* Right indicator */}
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 font-mono text-[11px]">
              <Radio className="w-3 h-3 animate-pulse text-emerald-400" />
              <span>Live Search Grounded</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col">
        {currentView === "pipeline" && <TrendPipeline />}
        {currentView === "opportunities" && (
          <OpportunityMatrix onSelectForCampaign={handleSelectForCampaign} />
        )}
        {currentView === "csv" && <CsvStudio />}
      </main>
    </div>
  );
}
