import { generateLiveText } from "./generate";
import {
  interpretLiveClipsPrompt,
  kitchenSearchPlanPrompt,
  recipesFromNewsPrompt,
  supplementRecipesPrompt,
} from "./prompts";

export type LiveDishInterpretation = {
  name: string;
  description: string;
  ingredients: string[];
  method: string[];
  videoIds: string[];
  cuisine_tags: string[];
};

function asStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function parsePayload(text: string): { dishes?: unknown[] } | null {
  try {
    const clean = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    return JSON.parse(clean);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export async function interpretYouTubeDishes(input: {
  clips: Array<{
    id: string;
    title: string;
    channel?: string;
    description?: string;
    views?: number;
    url?: string;
  }>;
  city?: string | null;
  cuisine?: string | null;
}): Promise<LiveDishInterpretation[]> {
  const clips = input.clips.filter((clip) => clip.id && clip.title).slice(0, 16);
  if (!clips.length) return [];

  try {
    const { text } = await generateLiveText(
      interpretLiveClipsPrompt({ ...input, clips }),
      { temperature: 0.25, maxOutputTokens: 2800 },
    );
    const parsed = parsePayload(text);
    const known = new Set(clips.map((clip) => clip.id));

    const parsedDishes = (parsed?.dishes ?? [])
      .map((raw) => {
        const dish = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        const name = typeof dish.name === "string" ? dish.name.trim() : "";
        const description = typeof dish.description === "string" ? dish.description.trim() : "";
        const ingredients = asStringList(dish.ingredients).slice(0, 12);
        const method = asStringList(dish.method).slice(0, 8);
        const videoIds = asStringList(dish.videoIds).filter((id) => known.has(id));
        return {
          name,
          description,
          ingredients,
          method,
          videoIds,
          cuisine_tags: asStringList(dish.cuisine_tags).slice(0, 6),
        };
      })
      .filter((dish) => dish.name.length > 1 && dish.description.length > 8);

    return parsedDishes
      .map((dish) => ({ ...dish, videoIds: dish.videoIds.slice(0, 1) }))
      .filter((dish) => dish.videoIds.length > 0 && !looksLikeVideoTitle(dish.name));
  } catch {
    return [];
  }
}

function looksLikeVideoTitle(name: string) {
  return /[😭🔥❤️‍🩹😂🤣]|vs\.?\s|i can.?t believe|finally happening|warmest welcome|back then|movie snack|1 second|\$\d/i.test(
    name,
  );
}

function parseDishes(text: string): LiveDishInterpretation[] {
  const parsed = parsePayload(text);
  return (parsed?.dishes ?? [])
    .map((raw) => {
      const dish = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const name = typeof dish.name === "string" ? dish.name.trim() : "";
      const description = typeof dish.description === "string" ? dish.description.trim() : "";
      return {
        name,
        description,
        ingredients: asStringList(dish.ingredients).slice(0, 12),
        method: asStringList(dish.method).slice(0, 8),
        videoIds: asStringList(dish.videoIds),
        cuisine_tags: asStringList(dish.cuisine_tags).slice(0, 6),
      };
    })
    .filter((dish) => dish.name.length > 1 && dish.description.length > 8 && !looksLikeVideoTitle(dish.name));
}

export async function supplementRecipeDishes(input: {
  city?: string | null;
  cuisine?: string | null;
  exclude?: string[];
}): Promise<LiveDishInterpretation[]> {
  try {
    const { text } = await generateLiveText(supplementRecipesPrompt(input), {
      temperature: 0.7,
      maxOutputTokens: 2200,
      search: true,
    });
    return parseDishes(text).filter((dish) => dish.ingredients.length >= 3 && dish.method.length >= 2);
  } catch {
    return [];
  }
}

export type KitchenSearchPlan = {
  queries: string[];
  foodWords: string[];
};

export async function planKitchenSearches(input: {
  city?: string | null;
  cuisine?: string | null;
  state?: string | null;
}): Promise<KitchenSearchPlan> {
  try {
    const { text } = await generateLiveText(kitchenSearchPlanPrompt(input), {
      temperature: 0.2,
      maxOutputTokens: 400,
    });
    const parsed = parsePayload(text) as { queries?: unknown; foodWords?: unknown } | null;
    const queries = asStringList(parsed?.queries)
      .filter((query) => /recipe|cook|how to/i.test(query) && !/restaurant|opening|best \w+ in/i.test(query))
      .map((query) => (/viral|most popular|tiktok|\bUS\b/i.test(query) ? query : `viral ${query}`))
      .slice(0, 2);
    const foodWords = asStringList(parsed?.foodWords).slice(0, 8);
    if (queries.length) return { queries, foodWords };
  } catch {
    // fall through
  }
  return { queries: [], foodWords: [] };
}

export type NewsRecipe = {
  name: string;
  description: string;
  ingredients: string[];
  method: string[];
  url: string;
};

export async function recipesFromNewsArticles(input: {
  articles: Array<{ title: string; url: string; source?: string }>;
  city?: string | null;
  cuisine?: string | null;
}): Promise<NewsRecipe[]> {
  const articles = input.articles.filter((article) => article.title && article.url).slice(0, 8);
  if (!articles.length) return [];
  try {
    const { text } = await generateLiveText(recipesFromNewsPrompt({ ...input, articles }), {
      temperature: 0.2,
      maxOutputTokens: 1800,
    });
    const parsed = parsePayload(text);
    const known = new Set(articles.map((article) => article.url));
    return (parsed?.dishes ?? [])
      .map((raw) => {
        const dish = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        const name = typeof dish.name === "string" ? dish.name.trim() : "";
        const description = typeof dish.description === "string" ? dish.description.trim() : "";
        const url = typeof dish.url === "string" ? dish.url.trim() : "";
        return {
          name,
          description,
          ingredients: asStringList(dish.ingredients).slice(0, 12),
          method: asStringList(dish.method).slice(0, 8),
          url: known.has(url) ? url : articles.find((article) => url && article.url === url)?.url || "",
        };
      })
      .filter((dish) => dish.name.length > 2 && dish.url && !/restaurant|opening|best \w+ in/i.test(dish.name));
  } catch {
    return [];
  }
}
