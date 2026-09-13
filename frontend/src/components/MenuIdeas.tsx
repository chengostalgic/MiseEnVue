"use client";

import { useEffect, useState } from "react";
import { BookmarkPlus, Loader2, Sparkles } from "lucide-react";
import CollectionPanel from "@/components/CollectionPanel";
import {
  listCollection,
  removeCollectionItem,
  saveCollectionItem,
  type CollectionItem,
} from "@/lib/collection";
import {
  enqueueGeneration,
  jobBusy,
  setIdeaDishes,
  useGenerationJobs,
  type IdeaDish,
} from "@/lib/generationJobs";
import { kitchenFromProfile, loadKitchenFacts, type IdeaKitchen, type KitchenFacts } from "@/lib/kitchenFacts";
import type { RestaurantProfile } from "@/lib/restaurantProfile";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

function creativityLabel(value: number) {
  if (value < 30) return "Stay on the menu";
  if (value >= 70) return "Go crazy — unexpected plates";
  return "Inventive, still runnable";
}

function fidelityLabel(value: number) {
  if (value < 30) return "The prompt is only a spark";
  if (value > 70) return "Treat the prompt as the spec";
  return "Honor the prompt, use kitchen facts";
}

export default function MenuIdeas({
  profile,
}: {
  profile?: Partial<RestaurantProfile> | null;
}) {
  const generation = useGenerationJobs();
  const dishes = generation.ideas;
  const loading = jobBusy("ideas", generation);
  const error = generation.jobs.ideas.error;
  const [facts, setFacts] = useState<KitchenFacts | null>(null);
  const [prompt, setPrompt] = useState("");
  const [creativity, setCreativity] = useState(45);
  const [fidelity, setFidelity] = useState(70);
  const [collection, setCollection] = useState<CollectionItem[]>([]);
  const [savedNames, setSavedNames] = useState<string[]>([]);

  useEffect(() => {
    void loadKitchenFacts(profile)
      .then(setFacts)
      .catch(() => {
        setFacts({
          kitchen: kitchenFromProfile(profile),
          source: "profile",
          restaurantId: profile?.id,
          menuCount: 0,
        });
      });
    void listCollection().then(setCollection);
  }, [
    profile,
    profile?.id,
    profile?.name,
    profile?.city,
    profile?.cuisine_type,
    profile?.pride_in,
    profile?.price_band,
    profile?.never_serve,
    profile?.primary_goal,
  ]);

  const kitchen: IdeaKitchen = facts?.kitchen ?? kitchenFromProfile(profile);

  function generate() {
    const exclude = dishes.map((dish) => dish.name);
    enqueueGeneration("ideas", async () => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (isSupabaseConfigured()) {
        const { data } = await getSupabaseClient().auth.getSession();
        const token = data.session?.access_token;
        if (token) headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch("/api/ideas", {
        method: "POST",
        headers,
        body: JSON.stringify({
          mode: "menu",
          prompt,
          creativity,
          fidelity,
          city: kitchen.city,
          cuisine: kitchen.cuisine,
          kitchen,
          exclude,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Could not invent plates");
      const next = Array.isArray(data.dishes) ? data.dishes : [];
      if (!next.length) throw new Error("No plates came back. Try a shorter prompt.");
      setIdeaDishes(next);
    });
  }

  async function collect(dish: IdeaDish) {
    await saveCollectionItem({
      kind: "dish",
      title: dish.name,
      summary: dish.sellingPoint || dish.why,
      source: "menu-ideas",
      source_url: null,
      source_id: `idea:${dish.name.toLowerCase()}`,
      creativity: String(creativity),
      payload: { ...dish, prompt, fidelity },
    });
    setSavedNames((current) => (current.includes(dish.name) ? current : [...current, dish.name]));
    setCollection(await listCollection());
  }

  async function dropCollected(id: string) {
    await removeCollectionItem(id);
    setCollection(await listCollection());
  }

  return (
    <div className="space-y-8 font-sans">
      <section className="space-y-2 pb-4 border-b border-neutral-100">
        <div className="text-[11px] text-[#0047FF] font-semibold uppercase tracking-wider">Kitchen R&D</div>
        <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-neutral-950">Ideas</h1>
        <p className="text-sm text-neutral-500">
          Fresh plates only — this will not write, code, or invent anything that is not food.
        </p>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-5 space-y-5 shadow-xs">
        <label className="block space-y-2">
          <span className="text-sm text-neutral-800">What should we invent?</span>
          <textarea
            rows={3}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="A late-night shareable that uses brisket. No new fryer. Something that photographs."
          />
          <p className="text-xs text-neutral-500">
            Name an ingredient or a theme you want on the plate. Unrelated prompts are rejected.
          </p>
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-neutral-800">Creativity</span>
              <span className="text-xs text-[#0047FF]">{creativity}</span>
            </div>
            <input
              className="idea-slider"
              type="range"
              min={0}
              max={100}
              value={creativity}
              onChange={(event) => setCreativity(Number(event.target.value))}
            />
            <div className="flex justify-between text-[11px] text-neutral-400">
              <span>Classic</span>
              <span>Wild</span>
            </div>
            <p className="text-xs text-neutral-500">{creativityLabel(creativity)}</p>
          </label>

          <label className="block space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-neutral-800">Stick to the prompt</span>
              <span className="text-xs text-[#0047FF]">{fidelity}</span>
            </div>
            <input
              className="idea-slider"
              type="range"
              min={0}
              max={100}
              value={fidelity}
              onChange={(event) => setFidelity(Number(event.target.value))}
            />
            <div className="flex justify-between text-[11px] text-neutral-400">
              <span>Loose</span>
              <span>Exact</span>
            </div>
            <p className="text-xs text-neutral-500">{fidelityLabel(fidelity)}</p>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-[4px] bg-[#0047FF] text-white px-3.5 py-2 text-sm hover:bg-[#0038df] disabled:opacity-60"
            onClick={() => void generate()}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generation.jobs.ideas.status === "queued"
              ? "Queued…"
              : generation.jobs.ideas.status === "running"
                ? "Inventing…"
                : dishes.length
                  ? "Another set"
                  : "Give me six plates"}
          </button>
        </div>
        {generation.jobs.ideas.status === "queued" ? (
          <p className="text-sm text-[#0047FF]">Ideas are queued. You can leave this tab — the plates will be here when they finish.</p>
        ) : generation.jobs.ideas.status === "running" ? (
          <p className="text-sm text-[#0047FF]">Inventing plates. You can leave this tab and come back for the set.</p>
        ) : error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : null}
      </section>

      {!dishes.length && !loading ? (
        <p className="text-sm text-neutral-500">
          No plates for this kitchen yet. Generate a set that matches{" "}
          {kitchen.cuisine || kitchen.name || "your menu"}.
        </p>
      ) : null}

      {dishes.length ? (
        <section className="space-y-3">
          <h2 className="text-sm text-neutral-500">This set</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {dishes.map((dish) => {
              const saved = savedNames.includes(dish.name);
              return (
                <article key={dish.name} className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3 shadow-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base text-neutral-950">{dish.name}</h3>
                      {dish.usesFromKitchen ? (
                        <p className="text-[11px] text-[#0047FF] mt-1">Uses {dish.usesFromKitchen}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-950"
                      onClick={() => void collect(dish)}
                      disabled={saved}
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      {saved ? "Saved" : "Collect"}
                    </button>
                  </div>
                  {dish.sellingPoint ? (
                    <p className="text-sm text-neutral-800 leading-relaxed">{dish.sellingPoint}</p>
                  ) : null}
                  {dish.why ? <p className="text-sm text-neutral-500 leading-relaxed">{dish.why}</p> : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm text-neutral-500">Collection</h2>
        <CollectionPanel items={collection} onRemove={(id) => void dropCollected(id)} />
      </section>
    </div>
  );
}
