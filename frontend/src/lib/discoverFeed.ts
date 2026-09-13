import type { ScrapedDish } from "@/lib/contractTypes";
import { looksLikeRestaurantStory } from "@/lib/kitchenSearch";
import { looksLikeVideoTitle } from "@/lib/liveDiscover";
import { evidenceLooksLikeInterview } from "@/lib/scrapeLab";

export function matchesCuisine(dish: ScrapedDish, cuisine?: string | null) {
  if (!cuisine?.trim()) return true;
  const tokens = cuisine
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3 && !/^(food|style|and|with|from)$/.test(word));
  if (!tokens.length) return true;
  const blob = [dish.name, dish.description, ...(dish.cuisine_tags ?? []), ...(dish.aliases ?? [])]
    .join(" ")
    .toLowerCase();
  return tokens.some((token) => blob.includes(token));
}

export function isNearbyDish(dish: ScrapedDish) {
  return (dish.metrics?.by_source?.google_maps ?? 0) > 0 || (dish.metrics?.local_restaurant_count ?? 0) > 0;
}

export function dishLine(dish: ScrapedDish) {
  const summary = dish.description?.trim() || dish.why_trending?.summary?.trim() || "";
  if (!summary) return "";
  return summary.split(/(?<=[.!?])\s+/)[0] ?? summary;
}

const FIXTURE_IDS = new Set([
  "chapli-kebab-chopped-cheese",
  "hooters-breaded-wings",
  "gnocchi-sausage-vodka-sauce",
  "short-rib-sandwich",
  "scones-strawberry-jam",
  "texas-bbq-brisket",
  "scrapple-sandwich",
  "italian-pastina-soup",
  "soy-glazed-eggplant-rice-bowl",
  "mushroom-risotto",
  "lemon-linguine",
  "apple-bear-claws",
  "chiles-rellenos",
]);

export function isCachedFixtureDish(dish: { id?: string; name?: string }) {
  const id = (dish.id || "").replace(/^opp-/, "");
  return FIXTURE_IDS.has(id);
}

const WEAK_EVIDENCE =
  /youtube\.com\/results|trends\.google\.com\/trends\/explore|google\.com\/search/i;

export function isResearchUrl(url?: string | null) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  return !WEAK_EVIDENCE.test(url);
}

export function hasResearchEvidence(dish: ScrapedDish) {
  const evidence = (dish.evidence ?? []).filter((item) => isResearchUrl(item.url));
  if (!evidence.length) return false;
  return evidence.some((item) => {
    const url = item.url || "";
    if (/youtube\.com\/watch|youtu\.be\/|tiktok\.com|instagram\.com|maps\.google|google\.com\/maps/i.test(url)) {
      return true;
    }
    if ((item.engagement ?? 0) > 0) return true;
    if (item.source === "youtube" || item.source === "google_maps" || item.source === "web" || item.source === "news") {
      return true;
    }
    return /eater|infatuation|nytimes|substack|reddit|timeout|thrillist/i.test(url);
  });
}

function primaryUrl(dish: ScrapedDish) {
  return dish.evidence?.find((item) => isResearchUrl(item.url))?.url || "";
}

export function rankDiscoverDishes(dishes: ScrapedDish[]): ScrapedDish[] {
  const seenVideo = new Set<string>();
  return [...dishes]
    .filter((dish) => {
      if (evidenceLooksLikeInterview(dish)) return false;
      if (looksLikeVideoTitle(dish.name)) return false;
      if (looksLikeRestaurantStory(dish.name) || looksLikeRestaurantStory(dish.description || "")) return false;
      const url = primaryUrl(dish);
      if (url) {
        if (seenVideo.has(url)) return false;
        seenVideo.add(url);
      }
      return Boolean(dish.name.trim());
    })
    .sort((a, b) => {
      const aVideo = (a.evidence ?? []).some((item) => item.source === "youtube") ? 1 : 0;
      const bVideo = (b.evidence ?? []).some((item) => item.source === "youtube") ? 1 : 0;
      if (bVideo !== aVideo) return bVideo - aVideo;
      return b.trend_score - a.trend_score;
    })
    .slice(0, 12);
}
