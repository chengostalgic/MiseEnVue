import type { ScrapedDish } from "@/lib/contractTypes";

export type LiveSignal = {
  platform?: string;
  caption?: string;
  views?: number;
  evidenceUrl?: string;
  sentiment?: string;
};

export type LiveResult = {
  summary?: string;
  signals?: LiveSignal[];
};

export function applyLiveEnrichment(dish: ScrapedDish, live: LiveResult) {
  const incoming = (live.signals ?? [])
    .map((signal) => ({
      source: String(signal.platform || "live"),
      url: signal.evidenceUrl || "",
      excerpt: (signal.caption || "").trim(),
      engagement: signal.views ?? null,
      sentiment: signal.sentiment,
    }))
    .filter((item) => item.excerpt);

  const seen = new Set((dish.evidence ?? []).map((item) => `${item.source}:${item.excerpt.slice(0, 80)}`));
  const fresh = incoming.filter((item) => !seen.has(`${item.source}:${item.excerpt.slice(0, 80)}`));

  return {
    dish: {
      ...dish,
      why_trending: {
        ...dish.why_trending,
        summary: live.summary || dish.why_trending?.summary,
      },
      evidence: [...fresh, ...(dish.evidence ?? [])].slice(0, 16),
      metrics: {
        ...dish.metrics,
        mention_count: (dish.metrics?.mention_count ?? 0) + fresh.length,
      },
    },
    added: fresh.length,
  };
}

export function dishesFromIdeas(
  ideas: Array<{
    name?: string;
    why?: string;
    spin?: string;
    marketingMove?: string;
    momentum?: string;
    evidence?: ScrapedDish["evidence"];
  }>,
): ScrapedDish[] {
  return ideas.flatMap((idea, index) => {
    const name = (idea.name || "").trim();
    if (!name) return [];
    const why = (idea.why || "Live find from a market search.").trim();
    const drivers = [idea.spin, idea.marketingMove].filter(Boolean) as string[];
    const dish: ScrapedDish = {
      id: `live-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}-${index}`,
      name,
      lane: "national",
      whyHere: idea.spin || why,
      kitchenFit: idea.marketingMove || "Live find — not paired to the menu yet",
      kitchenScore: 44,
      trend_score: 55,
      momentum: idea.momentum || "rising",
      why_trending: { summary: why, drivers },
      metrics: { mention_count: Math.max(1, idea.evidence?.length ?? 1), window_days: 21 },
      evidence: idea.evidence ?? [],
      cuisine_tags: ["live"],
    };
    return [dish];
  });
}
