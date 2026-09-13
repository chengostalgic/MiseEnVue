"use client";

import { useMemo } from "react";
import {
  applyScrapeLab,
  DEFAULT_LAB,
  PIPELINE_STEPS,
  pipelineCommand,
  type LabEmphasis,
  type ScrapeLabSettings,
} from "@/lib/scrapeLab";
import type { ScrapedDish } from "@/lib/contractTypes";

export default function ScrapeLab({
  settings,
  onChange,
  dishes,
  visibleCount,
  restaurantCity,
}: {
  settings: ScrapeLabSettings;
  onChange: (next: ScrapeLabSettings) => void;
  dishes: ScrapedDish[];
  visibleCount: number;
  restaurantCity?: string | null;
}) {
  const command = useMemo(() => {
    const parts = restaurantCity?.split(",").map((part) => part.trim()).filter(Boolean) ?? [];
    if (parts.length >= 2) {
      return pipelineCommand(parts[parts.length - 1], parts.slice(0, -1).join(", "));
    }
    return pipelineCommand(parts[0]);
  }, [restaurantCity]);

  const dropped = dishes.length - visibleCount;

  return (
    <section className="rounded-2xl border border-stone-800 bg-[#141210] p-5 sm:p-6 space-y-5">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/80">How the scrape thinks</p>
        <p className="text-sm text-stone-400 mt-2 max-w-3xl">
          The app does not scrape when you open Discover. A batch job writes a file:
          YouTube and food media for takes from anywhere, Maps for nearby reviews.
          Nearby is one lane. These toggles re-rank that file in the browser. They do not hit Google.
        </p>
      </div>

      <ol className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {PIPELINE_STEPS.map((step, index) => (
          <li key={step.title} className="rounded-xl border border-stone-800 bg-[#0c0b0a] p-3">
            <div className="text-[11px] tabular-nums text-stone-500">{String(index + 1).padStart(2, "0")}</div>
            <div className="mt-1 text-sm font-medium text-stone-100">{step.title}</div>
            <p className="mt-1 text-xs text-stone-500 leading-relaxed">{step.why}</p>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-4">
          <Toggle
            label="Hide celebrity interviews"
            hint="Sam Smith loves Hooters is 4M views about a guest, not a dish. The pipeline downweights these; this drops them from the list."
            checked={settings.hideInterviews}
            onChange={(hideInterviews) => onChange({ ...settings, hideInterviews })}
          />
          <Toggle
            label="Rising only"
            hint="Momentum comes from breakout ratio, or Google Trends if it answered. Steady/fading dishes stay off the board."
            checked={settings.risingOnly}
            onChange={(risingOnly) => onChange({ ...settings, risingOnly })}
          />
          <Toggle
            label="Nearby mentions only"
            hint="Optional filter. Keep dishes already named in this city or nearby reviews. Off by default — a Seoul or LA take can still be useful here."
            checked={settings.needLocal}
            onChange={(needLocal) => onChange({ ...settings, needLocal })}
          />
          <label className="block">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-stone-200">Minimum mentions</span>
              <span className="text-xs tabular-nums text-stone-500">{settings.minMentions}</span>
            </div>
            <input
              type="range"
              min={1}
              max={4}
              step={1}
              value={settings.minMentions}
              onChange={(event) => onChange({ ...settings, minMentions: Number(event.target.value) })}
              className="mt-2 w-full accent-amber-200"
            />
            <p className="mt-1 text-xs text-stone-500">
              One video is not a trend. Default is 2 independent mentions. Two cuts of the same Food Network segment still count as one creator in the live pipeline.
            </p>
          </label>
        </div>

        <div className="space-y-4">
          <fieldset>
            <legend className="text-sm text-stone-200">What to emphasize</legend>
            <p className="mt-1 text-xs text-stone-500 mb-2">
              Balanced keeps the file’s original score. The others only re-sort what you already have.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["balanced", "Balanced"],
                  ["virality", "Breakouts"],
                  ["reach", "Raw reach"],
                  ["local", "Nearby"],
                ] as Array<[LabEmphasis, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChange({ ...settings, emphasis: id })}
                  className={`rounded-xl border px-3 py-2 text-sm text-left ${
                    settings.emphasis === id
                      ? "border-amber-200/70 bg-amber-200/10 text-stone-50"
                      : "border-stone-800 text-stone-400 hover:text-stone-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="rounded-xl border border-stone-800 bg-[#0c0b0a] p-3">
            <div className="text-[11px] uppercase tracking-wider text-stone-500">This file, with these knobs</div>
            <p className="mt-2 text-sm text-stone-200">
              Showing {visibleCount} of {dishes.length} dishes
              {dropped ? ` · ${dropped} hidden` : ""}.
            </p>
            <p className="mt-2 text-xs text-stone-500 leading-relaxed">
              To actually scrape with a different city or neighborhood, run the batch. Discover will keep showing the last file until you do.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-[#141210] px-3 py-2 text-[11px] text-amber-100/90">
              {command}
            </pre>
            <button
              type="button"
              onClick={() => onChange(DEFAULT_LAB)}
              className="mt-3 text-xs text-stone-400 hover:text-stone-200"
            >
              Reset knobs
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex gap-3 items-start cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 accent-amber-200"
      />
      <span>
        <span className="block text-sm text-stone-200">{label}</span>
        <span className="block text-xs text-stone-500 leading-relaxed mt-0.5">{hint}</span>
      </span>
    </label>
  );
}

export { applyScrapeLab };
