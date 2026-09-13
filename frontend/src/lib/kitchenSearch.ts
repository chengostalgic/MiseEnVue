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

const US_STATES: Record<string, string> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california",
  CO: "colorado", CT: "connecticut", DE: "delaware", FL: "florida", GA: "georgia",
  HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa",
  KS: "kansas", KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland",
  MA: "massachusetts", MI: "michigan", MN: "minnesota", MS: "mississippi", MO: "missouri",
  MT: "montana", NE: "nebraska", NV: "nevada", NH: "new hampshire", NJ: "new jersey",
  NM: "new mexico", NY: "new york", NC: "north carolina", ND: "north dakota", OH: "ohio",
  OK: "oklahoma", OR: "oregon", PA: "pennsylvania", RI: "rhode island", SC: "south carolina",
  SD: "south dakota", TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont",
  VA: "virginia", WA: "washington", WV: "west virginia", WI: "wisconsin", WY: "wyoming",
  DC: "washington dc",
};

export function placeTokens(city?: string | null, state?: string | null) {
  const tokens: string[] = [];
  const cityName = (city || "").replace(/\s+/g, " ").trim().toLowerCase();
  const stateCode = (state || "").replace(/\s+/g, " ").trim().toUpperCase();
  if (cityName) tokens.push(cityName);
  if (stateCode) {
    tokens.push(stateCode.toLowerCase());
    const named = US_STATES[stateCode];
    if (named) tokens.push(named);
  }
  return [...new Set(tokens.filter((token) => token.length > 1))];
}

export function fallbackKitchenQueries(city?: string | null, cuisine?: string | null, state?: string | null) {
  const terms = kitchenFoodTerms(cuisine);
  const primary = terms[0] || "dinner";
  const secondary = terms[1] && terms[1] !== primary ? terms[1] : primary;
  const place = [city, state].map((part) => (part || "").replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
  const national = `viral ${primary} recipe US`;
  const local = place ? `${place} ${primary} recipe` : `most popular ${secondary} recipe US`;
  return [...new Set([national, local])].slice(0, 2);
}
