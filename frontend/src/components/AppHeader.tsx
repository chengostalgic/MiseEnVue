"use client";

import { ChefHat, Loader2, LogOut } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

export type AppView = "opportunities" | "pipeline" | "ideas" | "csv" | "lab";

const NAV: Array<{ id: AppView; label: string }> = [
  { id: "pipeline", label: "Discover" },
  { id: "ideas", label: "Ideas" },
  { id: "opportunities", label: "Decide" },
  { id: "csv", label: "Kitchen" },
  { id: "lab", label: "Lab" },
];

export default function AppHeader({
  email,
  restaurantName,
  restaurantCity,
  currentView,
  workingViews = [],
  onNavigate,
  onEditKitchen,
  onHome,
  backLabel,
  onBack,
  demo = false,
}: {
  email?: string | null;
  restaurantName?: string | null;
  restaurantCity?: string | null;
  currentView?: AppView;
  workingViews?: AppView[];
  onNavigate?: (view: AppView) => void;
  onEditKitchen?: () => void;
  onHome?: () => void;
  backLabel?: string;
  onBack?: () => void;
  demo?: boolean;
}) {
  const location = [restaurantName, restaurantCity].filter(Boolean).join(" · ");
  const signedIn = Boolean(email);

  async function signOut() {
    await getSupabaseClient().auth.signOut();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-stone-800/80 bg-[#0c0b0a]/95 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="h-14 flex items-center justify-between gap-3">
          <div className="min-w-0">
            {onHome ? (
              <button type="button" className="text-left min-w-0" onClick={onHome}>
                <div className="text-sm text-stone-100">MiseEnVue</div>
                <div className="text-xs text-stone-500 truncate">
                  {location || email || "Home"}
                </div>
              </button>
            ) : (
              <div className="min-w-0">
                <div className="text-sm text-stone-100">MiseEnVue</div>
                <div className="text-xs text-stone-500 truncate">
                  {location || email || (signedIn ? "Signed in" : "Sign in to your kitchen")}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {onBack ? (
              <button
                type="button"
                className="rounded-md px-2.5 py-1.5 text-sm text-stone-400 hover:text-stone-100"
                onClick={onBack}
              >
                {backLabel ?? "Back"}
              </button>
            ) : null}
            {onEditKitchen ? (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-stone-400 hover:text-stone-100"
                onClick={onEditKitchen}
              >
                <ChefHat className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Edit kitchen</span>
              </button>
            ) : null}
            {signedIn ? (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-stone-800 px-2.5 py-1.5 text-sm text-stone-300 hover:text-stone-100 hover:border-stone-600"
                onClick={() => void signOut()}
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            ) : demo ? (
              <span className="text-xs text-stone-500">Demo</span>
            ) : null}
          </div>
        </div>

        {onNavigate ? (
          <nav className="flex items-center gap-1 pb-3" aria-label="Main">
            {NAV.map((item) => {
              const active = currentView === item.id;
              const working = workingViews.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`flex-1 sm:flex-none rounded-md px-3 py-2 text-left ${
                    active ? "bg-stone-100 text-stone-950" : "text-stone-400 hover:text-stone-100"
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-sm">
                    {item.label}
                    {working ? <Loader2 className={`w-3 h-3 animate-spin ${active ? "text-stone-700" : "text-amber-200/90"}`} /> : null}
                  </span>
                </button>
              );
            })}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
