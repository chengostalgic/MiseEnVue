import { fallbackKitchenQueries, kitchenFoodTerms, looksLikeRestaurantStory } from "@/lib/kitchenSearch";

export type YouTubeClip = {
  id: string;
  title: string;
  channel: string;
  description: string;
  url: string;
  views: number;
  likes: number;
  query: string;
  thumbnail?: string;
};

export function youtubeThumb(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function youtubeKey() {
  return process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY || "";
}

const FOOD_HINTS = [
  "recipe", "cook", "food", "bake", "chef", "dish", "meal",
  "taco", "pizza", "burger", "pasta", "ramen", "sushi", "chicken",
  "cake", "cookie", "sandwich", "salad", "noodle", "dumpling",
  "brunch", "dessert", "chocolate", "matcha", "wings", "soup",
  "steak", "bread", "toast", "bagel", "grill", "fry", "sauce",
  "menu", "street food", "cafe", "mukbang",
  "snack", "boba", "latte", "tasting",
];

function looksLikeFood(text: string) {
  const blob = text.toLowerCase();
  return FOOD_HINTS.some((hint) => blob.includes(hint));
}

const VLOG_TITLE =
  /i can.?t believe|finally happening|warmest welcome|back then vs|movie snack|1 second vs|\$0\.\d+ vs/i;

function looksLikeVlog(title: string) {
  return VLOG_TITLE.test(title) || /[😭❤️‍🩹😂🤣]/.test(title);
}

function isQuotaError(status: number, detail: string) {
  return status === 403 || status === 429 || /quota|rateLimitExceeded/i.test(detail);
}

// search.list costs 100 quota units. Keep this tiny and cache hard.
const MAX_SEARCHES = 2;
const CLIP_TTL_MS = 45 * 60 * 1000;
const clipCache = new Map<string, { at: number; clips: YouTubeClip[]; note?: string }>();
let quotaBlockedUntil = 0;

export function cuisineSearchTerms(cuisine?: string | null) {
  return kitchenFoodTerms(cuisine);
}

export function leanYoutubeQueries(city?: string | null, cuisine?: string | null) {
  return fallbackKitchenQueries(city, cuisine);
}

export function youtubeQueries(_mood: string, city?: string | null, cuisine?: string | null) {
  return leanYoutubeQueries(city, cuisine);
}

function cacheKey(queries: string[], maxPerQuery: number, recentOnly: boolean) {
  return `${queries.join("|")}::${maxPerQuery}::${recentOnly ? "recent" : "any"}`;
}

async function fetchMostPopularClips(key: string, limit = 12): Promise<YouTubeClip[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("key", key);
  url.searchParams.set("chart", "mostPopular");
  url.searchParams.set("regionCode", "US");
  url.searchParams.set("videoCategoryId", "26");
  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set("maxResults", "25");

  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const clips: YouTubeClip[] = [];
  for (const item of data.items ?? []) {
    const title = item.snippet?.title || "";
    const description = (item.snippet?.description || "").slice(0, 480);
    if (!looksLikeFood(`${title} ${description}`) || looksLikeVlog(title) || looksLikeRestaurantStory(title)) continue;
    clips.push({
      id: item.id,
      title,
      channel: item.snippet?.channelTitle || "",
      description,
      url: `https://www.youtube.com/watch?v=${item.id}`,
      views: Number(item.statistics?.viewCount || 0),
      likes: Number(item.statistics?.likeCount || 0),
      query: "chart:mostPopular:US",
      thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || youtubeThumb(item.id),
    });
    if (clips.length >= limit) break;
  }
  return clips;
}

export async function searchYouTubeClips(
  queries: string[],
  maxPerQuery = 8,
  options?: { recentOnly?: boolean },
): Promise<{ clips: YouTubeClip[]; note?: string }> {
  const key = youtubeKey();
  if (!key) {
    return { clips: [], note: "YOUTUBE_API_KEY is not set on the server." };
  }

  const recentOnly = options?.recentOnly !== false;
  const lean = (queries.length ? queries : leanYoutubeQueries()).slice(0, MAX_SEARCHES);
  const cachedKey = cacheKey(lean, maxPerQuery, recentOnly);
  const cached = clipCache.get(cachedKey);
  if (cached && Date.now() - cached.at < CLIP_TTL_MS) {
    return { clips: cached.clips, note: cached.note };
  }

  if (Date.now() < quotaBlockedUntil) {
    return { clips: cached?.clips ?? [], note: "YouTube search quota is paused to save the rest of today's credits." };
  }

  const seen = new Set<string>();
  const clips: YouTubeClip[] = [];
  let searchNote: string | undefined;
  let searchesUsed = 0;

  const publishedAfter = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  for (const query of lean) {
    if (clips.length >= 10) break;
    const search = new URL("https://www.googleapis.com/youtube/v3/search");
    search.searchParams.set("key", key);
    search.searchParams.set("part", "snippet");
    search.searchParams.set("q", query);
    search.searchParams.set("type", "video");
    search.searchParams.set("maxResults", String(Math.min(8, maxPerQuery)));
    search.searchParams.set("order", "viewCount");
    search.searchParams.set("videoCategoryId", "26");
    if (recentOnly) search.searchParams.set("publishedAfter", publishedAfter);

    const res = await fetch(search);
    searchesUsed += 1;
    if (!res.ok) {
      let detail = "";
      try {
        const err = await res.json();
        detail = err?.error?.message || err?.error?.errors?.[0]?.reason || "";
      } catch {
        // ignore parse errors
      }
      searchNote = `YouTube search failed (${res.status})${detail ? `: ${detail}` : ""}`;
      if (isQuotaError(res.status, detail)) {
        quotaBlockedUntil = Date.now() + 30 * 60 * 1000;
      }
      break;
    }
    const data = await res.json();
    for (const item of data.items ?? []) {
      const id = item.id?.videoId;
      const title = item.snippet?.title || "";
      if (!id || seen.has(id) || looksLikeVlog(title) || looksLikeRestaurantStory(title)) continue;
      seen.add(id);
      clips.push({
        id,
        title: item.snippet?.title || "",
        channel: item.snippet?.channelTitle || "",
        description: (item.snippet?.description || "").slice(0, 480),
        url: `https://www.youtube.com/watch?v=${id}`,
        views: 0,
        likes: 0,
        query,
        thumbnail:
          item.snippet?.thumbnails?.high?.url ||
          item.snippet?.thumbnails?.medium?.url ||
          youtubeThumb(id),
      });
    }
    if (searchesUsed >= MAX_SEARCHES) break;
  }

  if (clips.length) {
    const stats = new URL("https://www.googleapis.com/youtube/v3/videos");
    stats.searchParams.set("key", key);
    stats.searchParams.set("part", "snippet,statistics");
    stats.searchParams.set("id", clips.map((clip) => clip.id).slice(0, 20).join(","));
    const statRes = await fetch(stats);
    if (statRes.ok) {
      const body = await statRes.json();
      type VideoStat = {
        id: string;
        snippet?: { description?: string };
        statistics?: { viewCount?: string; likeCount?: string };
      };
      const byId = new Map<string, VideoStat>(
        (body.items ?? []).map((item: VideoStat) => [item.id, item]),
      );
      for (const clip of clips) {
        const item = byId.get(clip.id);
        clip.views = Number(item?.statistics?.viewCount || 0);
        clip.likes = Number(item?.statistics?.likeCount || 0);
        const fuller = (item?.snippet?.description || "").replace(/\s+/g, " ").trim();
        if (fuller) clip.description = fuller.slice(0, 480);
        if (!clip.thumbnail) clip.thumbnail = youtubeThumb(clip.id);
      }
    }
    clipCache.set(cachedKey, { at: Date.now(), clips, note: searchNote });
    return { clips, note: searchNote };
  }

  if (searchNote && isQuotaError(0, searchNote)) {
    return { clips: [], note: searchNote };
  }

  const popular = await fetchMostPopularClips(key);
  if (popular.length) {
    clipCache.set(cachedKey, { at: Date.now(), clips: popular, note: searchNote });
    return { clips: popular, note: searchNote };
  }

  return { clips, note: searchNote };
}

export async function searchYouTubeForNames(names: string[], maxPerName = 2) {
  const first = names.map((name) => name.trim()).filter((name) => name.length > 2)[0];
  if (!first) return { clips: [] as YouTubeClip[] };
  return searchYouTubeClips([`${first} recipe`], maxPerName, { recentOnly: false });
}
