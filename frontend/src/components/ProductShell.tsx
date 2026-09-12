"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import TrendPipeline from "@/components/TrendPipeline";
import OpportunityMatrix from "@/components/OpportunityMatrix";
import CsvStudio from "@/components/CsvStudio";
import type { BudgetContract, ScrapedDish } from "@/lib/contractTypes";
import { money } from "@/lib/format";
import { getSupabaseClient } from "@/lib/supabase";
import { ClipboardList, Search, UtensilsCrossed } from "lucide-react";

type View = "opportunities" | "pipeline" | "csv";

const NAV: Array<{ id: View; label: string; icon: typeof Search }> = [
  { id: "opportunities", label: "Decide", icon: ClipboardList },
  { id: "pipeline", label: "Discover", icon: Search },
  { id: "csv", label: "Kitchen", icon: UtensilsCrossed },
];

export default function ProductShell({
  session,
  restaurantName,
  restaurantCity,
}: {
  session: Session;
  restaurantName?: string | null;
  restaurantCity?: string | null;
}) {
  const [currentView, setCurrentView] = useState<View>("opportunities");
  const [budget, setBudget] = useState<BudgetContract | null>(null);
  const [dishes, setDishes] = useState<ScrapedDish[]>([]);
  const [scrapeMeta, setScrapeMeta] = useState<{ fixture?: boolean; sourcesUsed?: string[] }>({});
  const [selectedDishId, setSelectedDishId] = useState<string | null>(null);
  const location = [restaurantName, restaurantCity].filter(Boolean).join(" · ");

  useEffect(() => {
    void fetch("/api/budget")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setBudget(data.budget);
      })
      .catch(() => undefined);

    void fetch("/api/trends")
      .then((res) => res.json())
      .then((data) => {
        if (!data.success || !Array.isArray(data.dishes)) return;
        setDishes(data.dishes);
        setScrapeMeta({ fixture: data.fixture, sourcesUsed: data.sourcesUsed });
        setSelectedDishId((current) => current ?? data.dishes[0]?.id ?? null);
      })
      .catch(() => undefined);
  }, []);

  const selectedDish = useMemo(
    () => dishes.find((dish) => dish.id === selectedDishId) ?? dishes[0] ?? null,
    [dishes, selectedDishId],
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#0c0b0a] text-stone-100">
      <header className="sticky top-0 z-30 border-b border-stone-800/80 bg-[#0c0b0a]/95">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm text-stone-100">MiseEnVue</div>
            <div className="text-xs text-stone-500 truncate">
              {location || session.user.email}
            </div>
          </div>

          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = currentView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCurrentView(item.id)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm ${
                    active
                      ? "bg-stone-100 text-stone-950"
                      : "text-stone-400 hover:text-stone-100"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            className="text-xs text-stone-400 hover:text-stone-100"
            onClick={() => getSupabaseClient().auth.signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6">
        {budget && (
          <section className="rounded-2xl border border-stone-800 bg-[#141210] p-4 sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/80">This month’s envelope</p>
                <p className="text-sm text-stone-400 mt-1">
                  From the P&L. Discover and campaigns stay inside these caps.
                </p>
              </div>
              {scrapeMeta.sourcesUsed?.length ? (
                <p className="text-[11px] text-stone-500">
                  Scrape: {scrapeMeta.sourcesUsed.join(" · ")}
                  {scrapeMeta.fixture ? " · sample" : ""}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Metric label="Health" value={budget.health?.band || "—"} />
              <Metric
                label="Can spend"
                value={money(budget.allocation?.total_budget?.amount)}
              />
              <Metric
                label="Menu trials"
                value={money(budget.constraints?.max_trial_ingredient_spend)}
              />
              <Metric
                label="Influencer cap"
                value={money(budget.constraints?.max_influencer_fee)}
              />
            </div>
          </section>
        )}

        {currentView === "opportunities" && (
          <OpportunityMatrix
            budget={budget}
            trendingDishes={dishes}
            onOpenDiscover={(dishId) => {
              if (dishId) setSelectedDishId(dishId);
              setCurrentView("pipeline");
            }}
          />
        )}
        {currentView === "pipeline" && (
          <TrendPipeline
            dishes={dishes}
            selectedDish={selectedDish}
            scrapeMeta={scrapeMeta}
            onSelectDish={(dish) => setSelectedDishId(dish.id)}
            onUseInKitchen={() => setCurrentView("csv")}
          />
        )}
        {currentView === "csv" && (
          <CsvStudio
            currentTrendingDish={
              selectedDish
                ? { name: selectedDish.name, aliases: selectedDish.aliases }
                : undefined
            }
          />
        )}
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-800 bg-[#0c0b0a] px-3.5 py-3">
      <div className="text-[11px] uppercase tracking-wider text-stone-500">{label}</div>
      <div className="mt-1 text-lg font-medium capitalize text-stone-50">{value}</div>
    </div>
  );
}
