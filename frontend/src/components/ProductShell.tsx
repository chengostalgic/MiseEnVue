"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import TrendPipeline from "@/components/TrendPipeline";
import OpportunityMatrix from "@/components/OpportunityMatrix";
import CsvStudio from "@/components/CsvStudio";
import MenuIdeas from "@/components/MenuIdeas";
import BudgetEnvelopeVisualizer from "@/components/BudgetEnvelopeVisualizer";
import type { BudgetContract, ScrapedDish } from "@/lib/contractTypes";
import { jobBusy, queuedKinds, resetKitchenOutputs, useGenerationJobs } from "@/lib/generationJobs";
import { hasResearchEvidence, isCachedFixtureDish } from "@/lib/discoverFeed";
import { looksLikeRestaurantStory } from "@/lib/kitchenSearch";
import type { RestaurantProfile } from "@/lib/restaurantProfile";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { ChefHat, ClipboardList, Loader2, LogOut, Megaphone, Search, Sparkles, UtensilsCrossed } from "lucide-react";

type View = "opportunities" | "pipeline" | "ideas" | "campaign" | "csv";

const NAV: Array<{ id: View; label: string; icon: typeof Search }> = [
  { id: "opportunities", label: "Decide", icon: ClipboardList },
  { id: "pipeline", label: "Discover", icon: Search },
  { id: "ideas", label: "Ideas", icon: Sparkles },
  { id: "campaign", label: "Campaign", icon: Megaphone },
  { id: "csv", label: "Inventory", icon: UtensilsCrossed },
];

export default function ProductShell({
  session,
  restaurantName,
  restaurantCity,
  cuisine,
  goal,
  neighborhood,
  state,
  profile,
  onEditProfile,
}: {
  session: Session | null;
  restaurantName?: string | null;
  restaurantCity?: string | null;
  cuisine?: string | null;
  goal?: string | null;
  neighborhood?: string | null;
  state?: string | null;
  profile?: Partial<RestaurantProfile> | null;
  onEditProfile?: () => void;
}) {
  const [currentView, setCurrentView] = useState<View>("opportunities");
  const [pipelineMode, setPipelineMode] = useState<"discover" | "campaign">("discover");
  const currentViewRef = useRef<View>("opportunities");
  const generation = useGenerationJobs();
  const [budget, setBudget] = useState<BudgetContract | null>(null);
  const [dishes, setDishes] = useState<ScrapedDish[]>([]);
  const [scrapeMeta, setScrapeMeta] = useState<{
    fixture?: boolean;
    source?: string;
    cuisine?: string | null;
    queries?: string[];
    sourcesUsed?: string[];
    market?: { city?: string; county?: string; region_name?: string; state?: string };
  }>({});
  const [selectedDishId, setSelectedDishId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const requestRef = useRef(0);
  const kitchenKeyRef = useRef<string | null>(null);

  const cityName = restaurantCity?.split(",").pop()?.trim() || restaurantCity || null;
  const kitchenKey = [restaurantName, cityName, cuisine, goal, neighborhood, state].join("|");
  const kitchenPending = loadedKey !== kitchenKey;
  const waiting = queuedKinds(generation);
  const viewBusy: Record<View, boolean> = {
    opportunities: false,
    pipeline: jobBusy("analyze", generation),
    ideas: jobBusy("ideas", generation),
    campaign: jobBusy("campaign", generation),
    csv: false,
  };

  async function loadTrends(fresh = false, requestId = requestRef.current) {
    const params = new URLSearchParams();
    if (cityName) params.set("city", cityName);
    if (cuisine) params.set("cuisine", cuisine);
    if (goal) params.set("goal", goal);
    if (neighborhood) params.set("neighborhood", neighborhood);
    if (state) params.set("state", state);
    if (restaurantName) params.set("name", restaurantName);
    if (fresh) params.set("fresh", "1");
    const res = await fetch(`/api/trends?${params.toString()}`);
    const data = await res.json();
    if (!data.success || !Array.isArray(data.dishes)) {
      throw new Error(data.error || "Could not load new recommendations");
    }
    if (requestRef.current !== requestId) return;
    setDishes(
      (data.dishes as ScrapedDish[]).filter(
        (dish) =>
          hasResearchEvidence(dish) &&
          !looksLikeRestaurantStory(dish.name),
      ),
    );
    setScrapeMeta({
      fixture: data.fixture,
      source: data.source,
      cuisine: data.kitchen?.cuisine ?? cuisine,
      queries: data.queries,
      sourcesUsed: data.sourcesUsed,
      market: data.market,
    });
    setSelectedDishId((current) => {
      if (current && data.dishes.some((dish: ScrapedDish) => dish.id === current)) return current;
      return data.dishes[0]?.id ?? null;
    });
  }

  useEffect(() => {
    void fetch("/api/budget")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setBudget(data.budget);
      })
      .catch(() => undefined);

    const req = ++requestRef.current;
    const changed = kitchenKeyRef.current != null && kitchenKeyRef.current !== kitchenKey;
    kitchenKeyRef.current = kitchenKey;
    resetKitchenOutputs();
    setDishes([]);
    setSelectedDishId(null);
    setRefreshError(null);
    setRefreshing(true);
    void loadTrends(changed, req)
      .then(() => {
        if (req !== requestRef.current) return;
        setLoadedKey(kitchenKey);
      })
      .catch((err) => {
        if (req !== requestRef.current) return;
        setRefreshError(err instanceof Error ? err.message : "Could not load new recommendations");
        setLoadedKey(kitchenKey);
      })
      .finally(() => {
        if (req === requestRef.current) setRefreshing(false);
      });
  }, [kitchenKey]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (requestRef.current && loadedKey !== kitchenKey) return;
      const req = ++requestRef.current;
      void loadTrends(false, req).catch(() => undefined);
    }, 12 * 60 * 1000);
    return () => window.clearInterval(tick);
  }, [kitchenKey, loadedKey]);

  useEffect(() => {
    currentViewRef.current = currentView;
    if (currentView === "pipeline") setPipelineMode("discover");
    if (currentView === "campaign") setPipelineMode("campaign");
  }, [currentView]);

  const researchedDishes = useMemo(
    () =>
      kitchenPending
        ? []
        : dishes.filter(
            (dish) =>
              hasResearchEvidence(dish) &&
              !looksLikeRestaurantStory(dish.name),
          ),
    [dishes, kitchenPending],
  );

  const selectedDish = useMemo(
    () => researchedDishes.find((dish) => dish.id === selectedDishId) ?? researchedDishes[0] ?? null,
    [researchedDishes, selectedDishId],
  );

  return (
    <div className="min-h-screen flex flex-col bg-white text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/90 backdrop-blur-md">
        <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-8 lg:px-12 h-14 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {onEditProfile ? (
            <button
              type="button"
              onClick={onEditProfile}
              title="Edit kitchen"
              className="justify-self-start max-w-full inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-700 hover:border-neutral-400 hover:text-neutral-950"
            >
              <ChefHat className="w-3.5 h-3.5 shrink-0 text-[#0047FF]" />
              <span className="truncate">{restaurantName || "Kitchen"}</span>
              <span className="hidden sm:inline text-neutral-400">Edit</span>
            </button>
          ) : (
            <div />
          )}
          <nav className="flex items-center gap-1.5 bg-[#0047FF] p-1 rounded-full shadow-xs">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = currentView === item.id;
              const working = viewBusy[item.id];
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
                  {working ? (
                    <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                  ) : (
                    <Icon className="w-3.5 h-3.5 shrink-0 transition-transform duration-[950ms] ease-[cubic-bezier(0.16,1,0.3,1)]" />
                  )}
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
          {session && isSupabaseConfigured() ? (
            <button
              type="button"
              onClick={() => void getSupabaseClient().auth.signOut()}
              className="justify-self-end inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-600 hover:border-neutral-400 hover:text-neutral-950"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          ) : (
            <div />
          )}
        </div>
      </header>

      <main className="flex-1 w-full">
        {kitchenPending || refreshing ? (
          <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-16 sm:py-24 flex flex-col items-center text-center gap-4">
            <Loader2 className="w-8 h-8 text-[#0047FF] animate-spin" />
            <div className="space-y-2 max-w-md">
              <h1 className="text-2xl font-light tracking-tight text-neutral-950">
                Please wait while we give you new recommendations
              </h1>
              <p className="text-sm text-neutral-500">
                Searching YouTube and news
                {cuisine ? ` for ${cuisine}` : ""}
                {cityName ? ` in ${cityName}` : ""}. The last kitchen’s list is put away until this scrape finishes.
              </p>
            </div>
          </div>
        ) : null}
        <div
          hidden={kitchenPending || refreshing}
          className="max-w-[1600px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-8 flex flex-col gap-6"
        >
          {refreshError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {refreshError}
            </div>
          ) : null}
          {waiting.length && generation.running ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-[#0047FF]">
              {waiting.map((kind) => kind[0].toUpperCase() + kind.slice(1)).join(" and ")}{" "}
              {waiting.length === 1 ? "is" : "are"} queued until{" "}
              {generation.running[0].toUpperCase() + generation.running.slice(1)} finishes.
            </div>
          ) : null}

          <div hidden={currentView !== "ideas"}>
            <MenuIdeas
              profile={
                profile ?? {
                  name: restaurantName ?? undefined,
                  city: restaurantCity ?? undefined,
                  neighborhood,
                  state,
                  cuisine_type: cuisine,
                  primary_goal: goal,
                }
              }
            />
          </div>

          <div hidden={currentView !== "pipeline" && currentView !== "campaign"}>
            <TrendPipeline
              dishes={researchedDishes}
              selectedDish={selectedDish}
              scrapeMeta={scrapeMeta}
              restaurantCity={restaurantCity}
              cuisine={cuisine}
              onSelectDish={(dish) => setSelectedDishId(dish.id)}
              onUseInKitchen={() => setCurrentView("csv")}
              onNavigateToCampaign={() => {
                if (currentViewRef.current === "pipeline") setCurrentView("campaign");
              }}
              onNavigateToDiscover={() => setCurrentView("pipeline")}
              onRefresh={() => {
                const req = ++requestRef.current;
                setRefreshing(true);
                setRefreshError(null);
                void loadTrends(true, req)
                  .then(() => {
                    if (req === requestRef.current) setLoadedKey(kitchenKey);
                  })
                  .catch((err) => {
                    if (req !== requestRef.current) return;
                    setRefreshError(err instanceof Error ? err.message : "Could not load new recommendations");
                  })
                  .finally(() => {
                    if (req === requestRef.current) setRefreshing(false);
                  });
              }}
              activeMode={pipelineMode}
            />
          </div>

          {currentView === "opportunities" ? (
            <div className="animate-butter-section flex flex-col gap-6">
              {budget && <BudgetEnvelopeVisualizer budget={budget} scrapeMeta={scrapeMeta} />}
              <OpportunityMatrix
                key={kitchenKey}
                budget={budget}
                trendingDishes={researchedDishes}
                onSelectDishId={(dishId) => {
                  const matched = researchedDishes.find(
                    (d) => d.id === dishId || dishId.includes(d.id) || d.id.includes(dishId),
                  );
                  if (matched) setSelectedDishId(matched.id);
                  else setSelectedDishId(dishId);
                }}
                onOpenDiscover={(dishId) => {
                  if (dishId) {
                    const matched = researchedDishes.find(
                      (d) => d.id === dishId || dishId.includes(d.id) || d.id.includes(dishId),
                    );
                    setSelectedDishId(matched?.id || dishId);
                  }
                  setCurrentView("pipeline");
                }}
                onOpenCampaign={(dishId) => {
                  if (dishId) {
                    const matched = researchedDishes.find(
                      (d) => d.id === dishId || dishId.includes(d.id) || d.id.includes(dishId),
                    );
                    setSelectedDishId(matched?.id || dishId);
                  }
                  setCurrentView("campaign");
                }}
              />
            </div>
          ) : null}

          {currentView === "csv" ? (
            <CsvStudio
              currentTrendingDish={
                selectedDish
                  ? { name: selectedDish.name, aliases: selectedDish.aliases }
                  : undefined
              }
              allDishes={researchedDishes}
              onSelectDish={(dishId) => setSelectedDishId(dishId)}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
