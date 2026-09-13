import type { LiveDishInterpretation } from "@miseenvue/agent";
import type { ScrapedDish } from "@/lib/contractTypes";
import { looksLikeRestaurantStory } from "@/lib/kitchenSearch";
import type { YouTubeClip } from "@/lib/youtubeSearch";
import { youtubeThumb } from "@/lib/youtubeSearch";

const VIDEO_TITLE =
  /[😭🔥❤️‍🩹😂🤣]|vs\.?\s|i can.?t believe|finally happening|warmest welcome|back then|movie snack|1 second|\$\d/i;

export function looksLikeVideoTitle(name: string) {
  return (
    VIDEO_TITLE.test(name) ||
    /#\S+/.test(name) ||
    /@\w+/.test(name) ||
    /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(name) ||
    /\b(with me|day \d+|mukbang|asmr|hotpot with me)\b/i.test(name)
  );
}

export function youtubeIdFromUrl(url?: string | null) {
  if (!url) return null;
  const watch = url.match(/[?&]v=([\w-]{11})/);
  if (watch) return watch[1];
  const short = url.match(/youtu\.be\/([\w-]{11})/);
  return short?.[1] ?? null;
}

export function cleanVideoDishTitle(title: string) {
  const cleaned = title
    .replace(/@\w+/g, " ")
    .replace(/#\S+/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, " ")
    .replace(/[|•·\-–—:,]+/g, " ")
    .replace(
      /\b(i tried|trying|viral|tiktok|trending|recipe|recipes|shorts?|official|how to make|how i make|have a|have|make|with me|day \d+|mukbang|asmr|the best|best ever|best|easy|quick|cheap|homemade|ultimate|perfect|simple|amazing|delicious|must try|pt\.?\s*\d+|part \d+|ep\.?\s*\d+|ways? to|from scratch)\b/gi,
      " ",
    )
    .replace(/[!?🔥😭❤️✨👉🍜🍲]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = cleaned
    .split(" ")
    .filter((word) => /[a-z]/i.test(word))
    .slice(0, 7);
  if (!words.length) return cleaned || title.trim();
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function nameKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function clipThumbnail(clip: YouTubeClip) {
  return clip.thumbnail || youtubeThumb(clip.id);
}

function dishFromOneClip(
  name: string,
  clip: YouTubeClip,
  extra?: {
    description?: string;
    recipe?: ScrapedDish["recipe"];
    cuisine_tags?: string[];
    drivers?: string[];
  },
): ScrapedDish | null {
  if (!name || !clip.url) return null;
  const what = extra?.description || `One YouTube cook of ${name}.`;
  return {
    id: `live-${clip.id}`,
    name,
    description: what,
    recipe: extra?.recipe,
    cuisine_tags: extra?.cuisine_tags,
    trend_score: Math.min(99, clip.views > 0 ? Math.round(Math.log10(1 + clip.views) * 18) : 74),
    momentum: clip.views >= 100_000 ? "rising" : "steady",
    whyHere: what,
    why_trending: {
      summary: what,
      drivers: extra?.drivers,
    },
    metrics: {
      mention_count: 1,
      total_engagement: clip.views,
      by_source: { youtube: 1 },
      creator_count: 1,
    },
    evidence: [
      {
        source: "youtube",
        url: clip.url,
        excerpt: what,
        engagement: clip.views || null,
        image: clipThumbnail(clip),
      },
    ],
    aliases: [clip.title],
  };
}

function firstSentence(text?: string) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.split(/(?<=[.!?])\s+/)[0]?.slice(0, 160) || clean.slice(0, 160);
}

function looksLikeJunkDescription(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return (
    clean.length < 12 ||
    /#\S+|@\w+|membership is now open|thank you for watching|subscribe|like and|recipe card|packwithme|asmr/i.test(
      clean,
    )
  );
}

function formatViews(views: number) {
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(views >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (views >= 1000) return `${(views / 1000).toFixed(views >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(views);
}

function dishBlurb(name: string, clip: YouTubeClip, interpreted?: string) {
  if (interpreted && !looksLikeJunkDescription(interpreted) && !looksLikeVideoTitle(interpreted)) {
    return interpreted.replace(/\s+/g, " ").trim().slice(0, 180);
  }
  const first = firstSentence(clip.description);
  if (first && !looksLikeJunkDescription(first)) return first;
  if (clip.views) return `${formatViews(clip.views)} views on YouTube`;
  if (clip.channel) return `${clip.channel} on YouTube`;
  return name;
}

export function dishNameFromTitle(title: string) {
  return cleanVideoDishTitle(title);
}

export function dishesFromClips(
  clips: YouTubeClip[],
  interpreted: LiveDishInterpretation[] = [],
  cuisine?: string | null,
): ScrapedDish[] {
  const kitchenTags = (cuisine || "")
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length > 2);
  const used = new Set<string>();
  return clips
    .map((clip) => {
      if (!clip.id || used.has(clip.id)) return null;
      used.add(clip.id);
      const named = interpreted.find((dish) => dish.videoIds.includes(clip.id));
      const name = cleanVideoDishTitle(named?.name || clip.title);
      if (!name || looksLikeVideoTitle(name) || looksLikeRestaurantStory(name) || looksLikeRestaurantStory(clip.title)) {
        return null;
      }
      return dishFromOneClip(name, clip, {
        description: dishBlurb(name, clip, named?.description),
        recipe:
          named && (named.ingredients.length || named.method.length)
            ? { ingredients: named.ingredients, method: named.method }
            : undefined,
        cuisine_tags: [...new Set([...(named?.cuisine_tags ?? []), ...kitchenTags])],
        drivers: named?.ingredients.slice(0, 4),
      });
    })
    .filter((dish): dish is ScrapedDish => dish != null)
    .sort((a, b) => b.trend_score - a.trend_score);
}

export function dishesFromInterpreted(
  clips: YouTubeClip[],
  interpreted: LiveDishInterpretation[],
): ScrapedDish[] {
  return dishesFromClips(clips, interpreted);
}

export function attachClipsToDishes(dishes: ScrapedDish[], clips: YouTubeClip[]): ScrapedDish[] {
  return dishes.map((dish) => {
    const existing = dish.evidence ?? [];
    if (existing.some((item) => item.source === "news" || item.source === "web" || /youtube\.com\/watch|youtu\.be\//i.test(item.url))) {
      return {
        ...dish,
        evidence: keepOneEvidence(existing),
      };
    }
    const tokens = dish.name
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 3);
    const match = clips.find((clip) => {
      if (nameKey(clip.query) === nameKey(dish.name)) return true;
      if (!tokens.length) return false;
      const blob = `${clip.title} ${clip.description}`.toLowerCase();
      return tokens.filter((token) => blob.includes(token)).length >= Math.min(2, tokens.length);
    });
    if (!match) return dish;
    return {
      ...dish,
      id: dish.id.startsWith("live-") ? dish.id : `live-${match.id}`,
      evidence: [
        {
          source: "youtube",
          url: match.url,
          excerpt: firstSentence(match.description) || cleanVideoDishTitle(match.title),
          engagement: match.views || null,
          image: clipThumbnail(match),
        },
      ],
    };
  });
}

function keepOneEvidence(evidence: NonNullable<ScrapedDish["evidence"]>) {
  const youtube = evidence.filter((item) => /youtube\.com\/watch|youtu\.be\//i.test(item.url));
  const rest = evidence.filter((item) => !/youtube\.com\/watch|youtu\.be\//i.test(item.url));
  const one = youtube[0] || rest[0];
  if (one && !one.image) {
    const id = youtubeIdFromUrl(one.url);
    if (id) one.image = youtubeThumb(id);
  }
  return one ? [one] : [];
}

export function attachTrendsPages(dishes: ScrapedDish[]): ScrapedDish[] {
  return dishes;
}

export function attachSearchEvidence(dishes: ScrapedDish[]): ScrapedDish[] {
  return dishes.map((dish) => ({ ...dish, evidence: keepOneEvidence(dish.evidence ?? []) }));
}
