"use client";

import { FormEvent, useState } from "react";
import {
  OCCASIONS,
  PRICE_BANDS,
  PRIMARY_GOALS,
  explainKitchenError,
  saveRestaurantProfile,
  type RestaurantProfile,
} from "@/lib/restaurantProfile";
import { ArrowLeft, ChefHat } from "lucide-react";

export default function KitchenIntake({
  existing,
  email,
  onSaved,
  onCancel,
}: {
  existing: RestaurantProfile | null;
  email?: string | null;
  onSaved: (row: RestaurantProfile) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [city, setCity] = useState(existing?.city ?? "");
  const [state, setState] = useState(existing?.state ?? "");
  const [cuisine, setCuisine] = useState(existing?.cuisine_type ?? "");
  const [priceBand, setPriceBand] = useState(
    PRICE_BANDS.some((band) => band.id === existing?.price_band) ? existing!.price_band! : "mid",
  );
  const [occasions, setOccasions] = useState<string[]>(existing?.service_occasions ?? []);
  const [goal, setGoal] = useState(
    PRIMARY_GOALS.some((item) => item.id === existing?.primary_goal)
      ? existing!.primary_goal!
      : "increase_revenue",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleOccasion(id: string) {
    setOccasions((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const row = await saveRestaurantProfile({
        name,
        city,
        state,
        neighborhood: existing?.neighborhood ?? "",
        cuisine,
        priceBand,
        occasions,
        goal,
      });
      onSaved(row);
    } catch (err) {
      setError(explainKitchenError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/90 backdrop-blur-md">
        <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-8 lg:px-12 h-14 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="justify-self-start inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-700 hover:border-neutral-400 hover:text-neutral-950"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to the board
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-1.5 bg-[#0047FF] px-3 py-1.5 rounded-full text-white text-xs font-medium">
            <ChefHat className="w-3.5 h-3.5" />
            {existing?.id ? "Edit kitchen" : "Set up kitchen"}
          </div>
          <p className="justify-self-end text-xs text-neutral-400 truncate">{email || existing?.name || ""}</p>
        </div>
      </header>

      <main className="flex-1 w-full">
        <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-8">
          <section className="max-w-xl rounded-xl border border-neutral-200 bg-white p-5 sm:p-6 space-y-5 shadow-xs">
            <div className="space-y-1 pb-1 border-b border-neutral-100">
              <div className="text-[11px] text-[#0047FF] font-semibold uppercase tracking-wider">Your kitchen</div>
              <h1 className="text-2xl font-light tracking-tight text-neutral-950">
                {existing?.id ? "Edit kitchen" : "Set up the kitchen"}
              </h1>
              <p className="text-sm text-neutral-500">
                Say it however you cook — a cuisine, a vibe, a fusion, or a messy sentence. We look up viral recipes from that, not restaurants.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <label className="block space-y-1.5 text-sm text-neutral-800">
                Kitchen name
                <input value={name} onChange={(event) => setName(event.target.value)} required />
              </label>

              <div className="grid grid-cols-[1fr_88px] gap-3">
                <label className="block space-y-1.5 text-sm text-neutral-800">
                  City
                  <input
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    placeholder="Austin"
                    required
                  />
                </label>
                <label className="block space-y-1.5 text-sm text-neutral-800">
                  State
                  <input
                    value={state}
                    onChange={(event) => setState(event.target.value)}
                    placeholder="TX"
                    maxLength={2}
                    required
                  />
                </label>
              </div>

              <label className="block space-y-1.5 text-sm text-neutral-800">
                What do you cook?
                <input
                  value={cuisine}
                  onChange={(event) => setCuisine(event.target.value)}
                  placeholder="French bistro vibe, weeknight noodles, spicy cheap plates…"
                  required
                />
                <span className="block text-xs text-neutral-400 font-normal">
                  Country + dish is fine. So is “steakhouse feel” or “grandma comfort.”
                </span>
              </label>

              <fieldset className="space-y-2">
                <legend className="text-sm text-neutral-800">Typical plate</legend>
                <div className="flex flex-wrap gap-2">
                  {PRICE_BANDS.map((band) => (
                    <button
                      key={band.id}
                      type="button"
                      className={`px-3 py-1.5 rounded-[4px] text-xs border transition ${
                        priceBand === band.id
                          ? "bg-neutral-950 text-white border-neutral-950"
                          : "bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400"
                      }`}
                      onClick={() => setPriceBand(band.id)}
                    >
                      {band.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm text-neutral-800">When do people come?</legend>
                <div className="flex flex-wrap gap-2">
                  {OCCASIONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`px-3 py-1.5 rounded-[4px] text-xs border transition ${
                        occasions.includes(item.id)
                          ? "bg-neutral-950 text-white border-neutral-950"
                          : "bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400"
                      }`}
                      onClick={() => toggleOccasion(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm text-neutral-800">What do you want this month?</legend>
                <div className="flex flex-wrap gap-2">
                  {PRIMARY_GOALS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`px-3 py-1.5 rounded-[4px] text-xs border transition ${
                        goal === item.id
                          ? "bg-neutral-950 text-white border-neutral-950"
                          : "bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400"
                      }`}
                      onClick={() => setGoal(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  className="rounded-[4px] bg-[#0047FF] text-white px-3.5 py-2 text-sm hover:bg-[#0038df] disabled:opacity-60"
                  type="submit"
                  disabled={loading || occasions.length === 0}
                >
                  {loading ? "Saving…" : existing?.id ? "Save kitchen" : "Show me what to run"}
                </button>
                {onCancel ? (
                  <button
                    className="rounded-[4px] border border-neutral-200 bg-white px-3.5 py-2 text-sm text-neutral-700 hover:border-neutral-400"
                    type="button"
                    onClick={onCancel}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>

            {error ? (
              <p className="text-sm text-rose-600" role="alert">
                {error}
              </p>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}
