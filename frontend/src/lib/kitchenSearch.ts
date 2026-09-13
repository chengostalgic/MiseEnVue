const STOP =
  /^(a|an|the|and|or|with|from|for|our|we|just|good|very|some|any|vibe|vibes|style|feel|energy|type|kind|cook|cooking|food|menu|kitchen|restaurant|spot|place|whatever|like|stuff|things)$/i;

const TYPOS: Record<string, string> = {
  mexian: "mexican",
  mexcian: "mexican",
  itallian: "italian",
  italain: "italian",
  japenese: "japanese",
  mediteranean: "mediterranean",
  barbeque: "bbq",
  "bar-b-que": "bbq",
};

const EXPAND: Record<string, string> = {
  steakhouse: "steak",
  bistro: "bistro",
  brunchy: "brunch",
  comfort: "comfort",
  smoke: "smoked",
  smoked: "smoked",
  spicy: "spicy",
  cheap: "cheap",
  grandma: "comfort",
  noodles: "noodles",
  dumpling: "dumpling",
  dumplings: "dumplings",
  pasta: "pasta",
  ramen: "ramen",
  taco: "taco",
  tacos: "tacos",
  burger: "burger",
  burgers: "burger",
  salad: "salad",
  fusion: "",
};

const RESTAURANT_STORY =
  /\b(restaurants?|opens?|opening|closes?|closing|now open|new location|food hall|resy|best \w+ in|guide to|date night in|dining scene|michelin-recognized|chain plans|enters .+ market)\b/i;

const RECIPE_STORY =
  /\b(recipe|recipes|tiktok|viral|how to make|homemade|from scratch|baked|sauce|pasta|noodles?|dumpling|ramen|taco|burger|steak frites|cook this|going viral)\b/i;

export function looksLikeRestaurantStory(text: string) {
  return RESTAURANT_STORY.test(text);
}

export function looksLikeRecipeStory(text: string) {
  return RECIPE_STORY.test(text) && !RESTAURANT_STORY.test(text);
}

function normalizeWord(word: string) {
  const lower = word.toLowerCase();
  return TYPOS[lower] || EXPAND[lower] || lower;
}

export function kitchenFoodTerms(cuisine?: string | null) {
  const raw = (cuisine || "").replace(/\s+/g, " ").trim();
  if (!raw) return [];
  const chunks = raw
    .split(/\s*(?:,|\/|&|\+| and )\s*/i)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const terms: string[] = [];
  for (const chunk of chunks) {
    const words = chunk
      .split(/[^a-z0-9]+/i)
      .map(normalizeWord)
      .filter((word) => word.length > 2 && !STOP.test(word));
    if (words.length) terms.push(words.slice(0, 3).join(" "));
    for (const word of words) {
      if (word.length > 3 && !terms.includes(word)) terms.push(word);
    }
  }
  return [...new Set(terms)].slice(0, 6);
}

export function fallbackKitchenQueries(city?: string | null, cuisine?: string | null) {
  const terms = kitchenFoodTerms(cuisine);
  const place = (city || "").replace(/\s+/g, " ").trim();
  const primary = terms[0] || "dinner";
  const secondary = terms[1] || primary;
  const queries = [`viral ${primary} recipe`, `viral ${secondary} recipe`];
  if (place && primary) queries[1] = `${place} ${primary} recipe`;
  return [...new Set(queries)].slice(0, 2);
}
