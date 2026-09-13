import type { ScrapedDish } from "@/lib/contractTypes";

export type LabEmphasis = "balanced" | "reach" | "virality" | "local";

export type ScrapeLabSettings = {
  minMentions: number;
  risingOnly: boolean;
  needLocal: boolean;
  hideInterviews: boolean;
  emphasis: LabEmphasis;
};

export const DEFAULT_LAB: ScrapeLabSettings = {
  minMentions: 2,
  risingOnly: false,
  needLocal: false,
  hideInterviews: false,
  emphasis: "balanced",
};

const INTERVIEW_RE =
  /joins |talks about|interview|\bloves\b|everything food|5 golden rules|from the test kitchen/i;

export function evidenceLooksLikeInterview(dish: ScrapedDish) {
  return (dish.evidence ?? []).some((item) => INTERVIEW_RE.test(item.excerpt || ""));
}

export function applyScrapeLab(dishes: ScrapedDish[], settings: ScrapeLabSettings): ScrapedDish[] {
  const filtered = dishes.filter((dish) => {
    if ((dish.metrics?.mention_count ?? 0) < settings.minMentions) return false;
    if (settings.risingOnly && dish.momentum !== "rising") return false;
    if (settings.needLocal && !(dish.metrics?.local_mention_count ?? 0)) return false;
    if (settings.hideInterviews && evidenceLooksLikeInterview(dish)) return false;
    return true;
  });

  if (settings.emphasis === "balanced") {
    return [...filtered].sort((a, b) => b.trend_score - a.trend_score);
  }

  return [...filtered].sort((a, b) => labScore(b, settings.emphasis) - labScore(a, settings.emphasis));
}

function labScore(dish: ScrapedDish, emphasis: LabEmphasis) {
  const reach = Math.log10(1 + (dish.metrics?.total_engagement ?? 0));
  const rising = dish.momentum === "rising" ? 1 : dish.momentum === "fading" ? 0.15 : 0.45;
  const local = dish.metrics?.local_mention_count ?? 0;
  const mentions = dish.metrics?.mention_count ?? 1;
  if (emphasis === "reach") return reach;
  if (emphasis === "virality") return rising * 3 + mentions * 0.35;
  return local * 4 + rising;
}

export function pipelineCommand(city?: string | null, neighborhood?: string | null) {
  const parts = ["python3 -m ingestion.pipeline --since 14 --force"];
  if (city) parts.push(`--city "${city.split(",")[0].trim()}"`);
  if (neighborhood) parts.push(`--neighborhood "${neighborhood}"`);
  return parts.join(" ");
}

export const PIPELINE_STEPS = [
  {
    title: "Watch the roster",
    why: "US food channels plus search. This is the main corpus — breakouts can start anywhere, not only in this county.",
  },
  {
    title: "Search the dialect",
    why: "i tried the viral / tiktok recipe / everyone is making — plus city queries when we want a nearby read.",
  },
  {
    title: "Read nearby reviews",
    why: "Maps is one factor. If several restaurants here named the same dish last week, that is useful — it does not disqualify a plate from another city.",
  },
  {
    title: "Ask if it broke out",
    why: "Views ÷ that channel’s own median. A 2× breakout is the dish, not the subscriber base. Maps uses restaurant count instead.",
  },
  {
    title: "Name the dish",
    why: "Claude clusters titles and reviews so hot honey smash at five Heights kitchens becomes one row.",
  },
] as const;
