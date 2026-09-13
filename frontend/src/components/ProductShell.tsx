"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import TrendPipeline from "@/components/TrendPipeline";
import OpportunityMatrix from "@/components/OpportunityMatrix";
import CsvStudio from "@/components/CsvStudio";
import BudgetEnvelopeVisualizer from "@/components/BudgetEnvelopeVisualizer";
import type { BudgetContract, ScrapedDish } from "@/lib/contractTypes";
import { money } from "@/lib/format";
import { ClipboardList, Megaphone, Search, UtensilsCrossed } from "lucide-react";

type View = "opportunities" | "pipeline" | "campaign" | "csv";

const NAV: Array<{ id: View; label: string; icon: typeof Search }> = [
  { id: "opportunities", label: "Decide", icon: ClipboardList },
  { id: "pipeline", label: "Discover", icon: Search },
  { id: "campaign", label: "Campaign", icon: Megaphone },
  { id: "csv", label: "Inventory", icon: UtensilsCrossed },
];

export default function ProductShell({
  session,
  restaurantName,
  restaurantCity,
}: {
  session: Session | null;
  restaurantName?: string | null;
  restaurantCity?: string | null;
}) {
  const [currentView, setCurrentView] = useState<View>("opportunities");
  const [budget, setBudget] = useState<BudgetContract | null>(null);
  const [dishes, setDishes] = useState<ScrapedDish[]>([]);
  const [scrapeMeta, setScrapeMeta] = useState<{ fixture?: boolean; sourcesUsed?: string[] }>({});
  const [selectedDishId, setSelectedDishId] = useState<string | null>(null);

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
    <div className="min-h-screen flex flex-col bg-white text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/90 backdrop-blur-md">
        <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-8 lg:px-12 h-14 flex items-center justify-center">
          <nav className="flex items-center gap-1.5 bg-[#0047FF] p-1 rounded-full shadow-xs">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = currentView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCurrentView(item.id)}
                  title={item.label}
                  aria-label={item.label}
                  className={`h-8 flex items-center rounded-full font-sans transition-all duration-[950ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    active
                      ? "bg-neutral-950 text-white pl-2.5 pr-3.5 shadow-xs"
                      : "bg-transparent text-white/80 hover:text-white hover:bg-white/15 px-2"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0 transition-transform duration-[950ms] ease-[cubic-bezier(0.16,1,0.3,1)]" />
                  <span
                    className={`whitespace-nowrap overflow-hidden transition-all duration-[950ms] ease-[cubic-bezier(0.16,1,0.3,1)] text-xs sm:text-sm font-medium ${
                      active
                        ? "max-w-28 opacity-100 ml-1.5 translate-x-0"
                        : "max-w-0 opacity-0 ml-0 -translate-x-1"
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full">
        <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-8 flex flex-col gap-6">
          <div key={currentView} className="animate-butter-section flex flex-col gap-6">
            {currentView === "opportunities" && (
              <>
                {budget && (
                  <BudgetEnvelopeVisualizer
                    budget={budget}
                    scrapeMeta={scrapeMeta}
                  />
                )}

                <OpportunityMatrix
                  budget={budget}
                  trendingDishes={dishes}
                  onSelectDishId={(dishId) => {
                    const matched = dishes.find(
                      (d) => d.id === dishId || dishId.includes(d.id) || d.id.includes(dishId),
                    );
                    if (matched) setSelectedDishId(matched.id);
                    else setSelectedDishId(dishId);
                  }}
                  onOpenDiscover={(dishId) => {
                    if (dishId) {
                      const matched = dishes.find(
                        (d) => d.id === dishId || dishId.includes(d.id) || d.id.includes(dishId),
                      );
                      setSelectedDishId(matched?.id || dishId);
                    }
                    setCurrentView("pipeline");
                  }}
                  onOpenCampaign={(dishId) => {
                    if (dishId) {
                      const matched = dishes.find(
                        (d) => d.id === dishId || dishId.includes(d.id) || d.id.includes(dishId),
                      );
                      setSelectedDishId(matched?.id || dishId);
                    }
                    setCurrentView("campaign");
                  }}
                />
              </>
            )}

            {currentView === "pipeline" && (
              <TrendPipeline
                dishes={dishes}
                selectedDish={selectedDish}
                scrapeMeta={scrapeMeta}
                onSelectDish={(dish) => setSelectedDishId(dish.id)}
                onUseInKitchen={() => setCurrentView("csv")}
                onNavigateToCampaign={() => setCurrentView("campaign")}
                onNavigateToDiscover={() => setCurrentView("pipeline")}
                activeMode="discover"
              />
            )}

            {currentView === "campaign" && (
              <TrendPipeline
                dishes={dishes}
                selectedDish={selectedDish}
                scrapeMeta={scrapeMeta}
                onSelectDish={(dish) => setSelectedDishId(dish.id)}
                onUseInKitchen={() => setCurrentView("csv")}
                onNavigateToCampaign={() => setCurrentView("campaign")}
                onNavigateToDiscover={() => setCurrentView("pipeline")}
                activeMode="campaign"
              />
            )}

            {currentView === "csv" && (
              <CsvStudio
                currentTrendingDish={
                  selectedDish
                    ? { name: selectedDish.name, aliases: selectedDish.aliases }
                    : undefined
                }
                allDishes={dishes}
                onSelectDish={(dishId) => setSelectedDishId(dishId)}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
