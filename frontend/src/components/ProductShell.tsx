"use client";

import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import TrendPipeline from "@/components/TrendPipeline";
import OpportunityMatrix from "@/components/OpportunityMatrix";
import CsvStudio from "@/components/CsvStudio";
import { getSupabaseClient } from "@/lib/supabase";
import type { OpportunityCard } from "@/lib/opportunities";
import { FileSpreadsheet, Radio, Sparkles, TrendingUp, Zap } from "lucide-react";

type View = "pipeline" | "opportunities" | "csv";

export default function ProductShell({
  session,
  restaurantName,
}: {
  session: Session;
  restaurantName?: string | null;
}) {
  const [currentView, setCurrentView] = useState<View>("opportunities");
  const [selectedOpportunity, setSelectedOpportunity] = useState<OpportunityCard | null>(null);

  function handleSelectForCampaign(opportunity: OpportunityCard) {
    setSelectedOpportunity(opportunity);
    setCurrentView("pipeline");
  }

  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800/80 bg-neutral-900/60 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-white/10">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-white text-lg">MiseEnVue</span>
              </div>
              <div className="text-[11px] text-neutral-400 truncate">
                {restaurantName || session.user.email}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-neutral-950/80 border border-neutral-800 p-1 rounded-xl shadow-inner">
            <button
              onClick={() => setCurrentView("opportunities")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                currentView === "opportunities"
                  ? "bg-neutral-800 text-white shadow-sm border border-neutral-700/60"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>Opportunities</span>
            </button>
            <button
              onClick={() => setCurrentView("pipeline")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                currentView === "pipeline"
                  ? "bg-neutral-800 text-white shadow-sm border border-neutral-700/60"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Research</span>
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
              <span>Kitchen</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 font-mono text-[11px]">
              <Radio className="w-3 h-3 animate-pulse text-emerald-400" />
              Live
            </span>
            <button
              type="button"
              className="text-xs font-semibold text-neutral-300 border border-neutral-800 rounded-lg px-2.5 py-1 hover:bg-neutral-800"
              onClick={() => getSupabaseClient().auth.signOut()}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col">
        {currentView === "opportunities" && (
          <OpportunityMatrix onSelectForCampaign={handleSelectForCampaign} />
        )}
        {currentView === "pipeline" && (
          <TrendPipeline initialTopic={selectedOpportunity?.dishName} />
        )}
        {currentView === "csv" && (
          <CsvStudio
            currentTrendingDish={
              selectedOpportunity
                ? { name: selectedOpportunity.dishName }
                : undefined
            }
          />
        )}
      </main>
    </div>
  );
}
