import type { BudgetContract, ScrapedDish, ScrapedEvidence } from "@/lib/contractTypes";

export const SCRAPE_SCORING_VERSION = "scrape-v3";

export const SCORE_WEIGHTS = {
  trend: 0.2,
  growth: 0.15,
  operational: 0.15,
  menuFit: 0.15,
  financial: 0.1,
  goal: 0.1,
  local: 0.1,
  price: 0.05,
} as const;

export type RecommendationType =
  | "menu_variant"
  | "limited_time_offer"
  | "add_on"
  | "drink"
  | "dessert"
  | "new_menu_item";

export type OpportunityAnalysis = {
  recommendationType: RecommendationType;
  confidence: number;
  cuisineFit: number;
  goalFit: number;
  financialFit: number;
  existingIngredients: string[];
  newIngredients: string[];
  estimatedLaunchCost: number | null;
  suggestedExperiment: string;
  risks: string[];
  missingData: string[];
};

const MATCH_FLOOR = 0.25;
const RUN_DAYS = 14;
const GENERIC_NAME = new Set([
  "sandwich",
  "burger",
  "taco",
  "bowl",
  "salad",
  "noodles",
  "soup",
  "latte",
  "coffee",
  "fries",
  "cup",
  "plate",
]);

const STOPWORDS = new Set([
  "the",
  "and",
  "with",
  "for",
  "from",
  "this",
  "that",
  "style",
  "iconic",
  "best",
  "classic",
  "house",
  "made",
  "most",
  "ordered",
]);

export type KitchenMenuItem = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  price: number;
  estimated_cost: number | null;
};

export type KitchenIngredient = {
  id: string;
  name: string;
};

export type KitchenInventory = {
  ingredient_id: string;
  ingredient_name: string;
  quantity_on_hand: number;
};

export type KitchenSales = {
  menu_item_id: string | null;
  quantity: number;
  sold_at: string;
};

export type KitchenFinance = {
  experimentBudget?: number | null;
  maxNewIngredients?: number | null;
  maxTrialSpend?: number | null;
  capexAvailable?: number | null;
  minDishMarginPct?: number | null;
  averageCheck?: number | null;
  foodCostPct?: number | null;
};

export type KitchenSnapshot = {
  restaurant: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    neighborhood?: string | null;
    cuisine_type?: string | null;
    restaurant_type?: string | null;
    primary_goal?: string | null;
    experiment_budget?: number | null;
    max_new_ingredients?: number | null;
    pride_in?: string | null;
    price_band?: string | null;
    service_occasions?: string[] | null;
    never_serve?: string | null;
  };
  finance?: KitchenFinance;
  menuItems: KitchenMenuItem[];
  ingredients: KitchenIngredient[];
  inventory: KitchenInventory[];
  sales: KitchenSales[];
};

export type PairingEvidence = {
  evidence_type:
    | "trend_growth"
    | "menu_similarity"
    | "ingredient_overlap"
    | "local_relevance"
    | "margin_impact"
    | "sales_baseline";
  source: string;
  value: number | null;
  display_value: string | null;
  description: string;
};

export type DishPairing = {
  slug: string;
  dishName: string;
  keywords: string[];
  description: string | null;
  trendScore: number;
  velocity: number;
  trendStatus: "active" | "fading";
  region: string | null;
  menuItemId: string | null;
  menuItemName: string | null;
  menuItemPrice: number | null;
  scores: {
    trend: number;
    local: number;
    menuFit: number;
    operational: number;
    profitability: number;
    overall: number;
  };
  suggestedName: string;
  suggestedPrice: number | null;
  estimatedCost: number | null;
  incrementalRevenue: number | null;
  incrementalProfit: number | null;
  recommendation: string;
  missingIngredients: string[];
  analysis: OpportunityAnalysis;
  evidence: PairingEvidence[];
  signals: Array<{
    source: string;
    sourceId: string;
    url: string | null;
    excerpt: string;
    engagement: number | null;
    observedAt: string;
    signalValue: number;
  }>;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function tokenize(text: string | null | undefined) {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function dice(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) return 0;
  const other = new Set(b);
  const overlap = a.filter((token) => other.has(token)).length;
  return (2 * overlap) / (a.length + b.length);
}

function formatViews(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M views`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k views`;
  return `${Math.round(value)} views`;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function dishTokens(dish: ScrapedDish) {
  return unique([
    ...tokenize(dish.name),
    ...(dish.aliases ?? []).flatMap(tokenize),
    ...(dish.cuisine_tags ?? []).flatMap(tokenize),
  ]);
}

function itemTokens(item: KitchenMenuItem) {
  return unique([
    ...tokenize(item.name),
    ...tokenize(item.description),
    ...tokenize(item.category),
    ...(item.tags ?? []).flatMap(tokenize),
  ]);
}

function nameOverlapBonus(dish: ScrapedDish, item: KitchenMenuItem) {
  const names = unique([
    ...tokenize(dish.name),
    ...(dish.aliases ?? []).flatMap(tokenize),
  ]);
  const itemName = tokenize(item.name);
  if (names.length === 0 || itemName.length === 0) return 0;
  const hits = names.filter((token) => itemName.includes(token));
  const distinctive = hits.filter((token) => !GENERIC_NAME.has(token));
  if (distinctive.length) return Math.min(0.4, distinctive.length * 0.16);
  return hits.length ? 0.04 : 0;
}

function bestMenuMatch(dish: ScrapedDish, menuItems: KitchenMenuItem[]) {
  const tokens = dishTokens(dish);
  const aliases = [dish.name, ...(dish.aliases ?? [])].map((value) => value.toLowerCase());

  let best: { item: KitchenMenuItem; similarity: number } | null = null;
  for (const item of menuItems) {
    const haystack = `${item.name} ${item.description ?? ""} ${(item.tags ?? []).join(" ")}`.toLowerCase();
    const phraseBonus = aliases.some((alias) => alias.length > 6 && haystack.includes(alias)) ? 0.2 : 0;
    const similarity = Math.min(1, dice(tokens, itemTokens(item)) + nameOverlapBonus(dish, item) + phraseBonus);
    if (!best || similarity > best.similarity) {
      best = { item, similarity };
    }
  }
  return best;
}

function ingredientOverlap(dish: ScrapedDish, kitchen: KitchenSnapshot) {
  const needed = unique([
    ...tokenize(dish.name),
    ...(dish.aliases ?? []).flatMap(tokenize),
  ]).filter((token) => token.length > 3);

  if (needed.length === 0 || kitchen.ingredients.length === 0) {
    return { score: 60, missing: [] as string[], matched: 0, total: needed.length };
  }

  const stock = kitchen.ingredients.map((ingredient) => ({
    ...ingredient,
    tokens: tokenize(ingredient.name),
  }));
  const inStock = new Set(
    kitchen.inventory
      .filter((row) => row.quantity_on_hand > 0)
      .map((row) => row.ingredient_id),
  );

  const missing: string[] = [];
  let matched = 0;
  for (const token of needed) {
    const hit = stock.find((ingredient) => ingredient.tokens.includes(token) || ingredient.name.toLowerCase().includes(token));
    if (hit && inStock.has(hit.id)) {
      matched += 1;
    } else if (hit) {
      missing.push(hit.name);
    } else {
      missing.push(token);
    }
  }

  return {
    score: round2((matched / needed.length) * 100),
    missing: unique(missing).slice(0, 5),
    matched,
    total: needed.length,
  };
}

function dishBlob(dish: ScrapedDish) {
  return [
    dish.name,
    dish.description,
    ...(dish.aliases ?? []),
    ...(dish.cuisine_tags ?? []),
    ...(dish.recipe?.ingredients ?? []),
    dish.why_trending?.summary,
    dish.why_trending?.audience,
    ...(dish.why_trending?.drivers ?? []),
    ...(dish.evidence ?? []).map((item) => item.excerpt),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function localScore(dish: ScrapedDish, kitchen: KitchenSnapshot) {
  const city = kitchen.restaurant.city?.toLowerCase() ?? "";
  const state = kitchen.restaurant.state?.toLowerCase() ?? "";
  const neighborhood = kitchen.restaurant.neighborhood?.toLowerCase() ?? "";
  const blob = dishBlob(dish);
  const localMentions = dish.metrics?.local_mention_count ?? 0;
  const restaurants = dish.metrics?.local_restaurant_count ?? 0;

  if (restaurants >= 3) {
    return {
      score: clamp(82 + restaurants * 3, 80, 98),
      region: kitchen.restaurant.neighborhood ?? kitchen.restaurant.city ?? null,
      why: `${restaurants} nearby restaurants mentioned this in the last two weeks`,
    };
  }
  if (neighborhood && blob.includes(neighborhood)) {
    return { score: 100, region: kitchen.restaurant.neighborhood ?? null, why: `Already showing up in ${kitchen.restaurant.neighborhood}` };
  }
  if (city && blob.includes(city)) {
    return { score: 88, region: kitchen.restaurant.city ?? null, why: `Mentions ${kitchen.restaurant.city}` };
  }
  if (state && state.length === 2 && blob.includes(state)) {
    return { score: 78, region: kitchen.restaurant.city ?? null, why: "Mentions this state" };
  }
  if (localMentions > 0) {
    return {
      score: clamp(70 + localMentions * 5, 60, 95),
      region: kitchen.restaurant.neighborhood ?? kitchen.restaurant.city ?? null,
      why: `${localMentions} local mention${localMentions === 1 ? "" : "s"}`,
    };
  }
  return { score: 55, region: null, why: "Wider signal — not named nearby yet" };
}

function identityScore(dish: ScrapedDish, kitchen: KitchenSnapshot) {
  const restaurant = kitchen.restaurant;
  const hasIdentity = Boolean(restaurant.pride_in || restaurant.cuisine_type || restaurant.never_serve);
  if (!hasIdentity) {
    return { score: 55, why: "No kitchen profile yet" };
  }

  const blob = dishBlob(dish);
  let score = 52;
  const why: string[] = [];

  const banned = tokenize(restaurant.never_serve).filter((token) => token.length > 3);
  if (banned.some((token) => blob.includes(token))) {
    return { score: 8, why: "Conflicts with what you said you would never serve" };
  }

  const cuisineTokens = tokenize(restaurant.cuisine_type);
  const dishCuisine = (dish.cuisine_tags ?? []).flatMap(tokenize);
  if (cuisineTokens.some((token) => dishCuisine.includes(token) || blob.includes(token))) {
    score += 16;
    why.push("Matches how you describe the food");
  } else if (cuisineTokens.length) {
    score -= 8;
  }

  const prideHits = tokenize(restaurant.pride_in).filter((token) => token.length > 3 && blob.includes(token));
  if (prideHits.length) {
    score += Math.min(22, prideHits.length * 8);
    why.push("Overlaps what you pride yourself on");
  }

  const occasions = restaurant.service_occasions ?? [];
  const audience = `${dish.why_trending?.audience ?? ""} ${blob}`;
  if (occasions.includes("late_night") && /late.?night/.test(audience)) {
    score += 10;
    why.push("Fits late night");
  }
  if (occasions.includes("brunch") && /brunch|breakfast/.test(audience)) {
    score += 8;
    why.push("Fits brunch");
  }
  if (
    occasions.length > 0 &&
    occasions.includes("late_night") &&
    !occasions.includes("brunch") &&
    /brunch|breakfast/.test(audience) &&
    !/late/.test(audience)
  ) {
    score -= 14;
    why.push("Looks like a brunch dish");
  }

  if (restaurant.price_band === "value" && /\$3[0-9]|\$4[0-9]|fine dining|tasting menu/.test(blob)) {
    score -= 16;
    why.push("Price world looks too high");
  }
  if (restaurant.price_band === "fine" && /dollar menu|fast food|food truck hack/.test(blob)) {
    score -= 10;
    why.push("Too casual for this room");
  }

  return {
    score: clamp(score),
    why: why.join(". ") || "Same city, different kitchen — weak identity overlap",
  };
}

function salesForItem(kitchen: KitchenSnapshot, menuItemId: string) {
  const cutoff = Date.now() - 28 * 24 * 60 * 60 * 1000;
  const rows = kitchen.sales.filter(
    (row) => row.menu_item_id === menuItemId && new Date(row.sold_at).getTime() >= cutoff,
  );
  const units = rows.reduce((sum, row) => sum + row.quantity, 0);
  const days = new Set(rows.map((row) => row.sold_at.slice(0, 10))).size;
  return { units, days, unitsPerDay: days > 0 ? units / days : null };
}

function profitabilityAndEconomics(
  dish: ScrapedDish,
  item: KitchenMenuItem | null,
  kitchen: KitchenSnapshot,
) {
  const margins = kitchen.menuItems
    .filter((row) => row.estimated_cost != null && row.price > 0)
    .map((row) => (row.price - (row.estimated_cost ?? 0)) / row.price);
  const typical = median(margins) ?? 0.65;

  if (!item || item.estimated_cost == null) {
    return {
      score: 55,
      suggestedPrice: null,
      estimatedCost: null,
      incrementalRevenue: null,
      incrementalProfit: null,
      contributionDelta: null,
      weeklyUnits: null,
    };
  }

  const suggestedPrice = round2(item.price + 1.5);
  const extraCost = 0.35;
  const estimatedCost = round2(item.estimated_cost + extraCost);
  const proposedMargin = (suggestedPrice - estimatedCost) / suggestedPrice;
  const score = clamp(50 + (proposedMargin - typical) * 200);

  const sales = salesForItem(kitchen, item.id);
  if (sales.days < 3 || sales.unitsPerDay == null) {
    return {
      score: round2(score),
      suggestedPrice,
      estimatedCost,
      incrementalRevenue: null,
      incrementalProfit: null,
      contributionDelta: round2(suggestedPrice - estimatedCost - (item.price - item.estimated_cost)),
      weeklyUnits: null,
    };
  }

  const uplift = Math.min(0.25, Math.max(0.05, (dish.trend_score - 50) / 200));
  const baselineUnits = sales.unitsPerDay * RUN_DAYS;
  const expectedUnits = baselineUnits * (1 + uplift);
  const currentContribution = item.price - item.estimated_cost;
  const proposedContribution = suggestedPrice - estimatedCost;
  const incrementalRevenue = round2(expectedUnits * suggestedPrice - baselineUnits * item.price);
  const incrementalProfit = round2(expectedUnits * proposedContribution - baselineUnits * currentContribution);

  return {
    score: round2(score),
    suggestedPrice,
    estimatedCost,
    incrementalRevenue,
    incrementalProfit,
    contributionDelta: round2(proposedContribution - currentContribution),
    weeklyUnits: round2(sales.unitsPerDay * 7),
  };
}

function topEvidence(evidence: ScrapedEvidence[] | undefined) {
  return [...(evidence ?? [])]
    .sort((a, b) => (b.engagement ?? 0) - (a.engagement ?? 0))
    .slice(0, 4);
}

function sourceIdFor(item: ScrapedEvidence, index: number) {
  const video = item.url?.match(/[?&]v=([^&]+)/)?.[1];
  if (video) return `yt:${video}`;
  return `${item.source}:${item.url || index}`;
}

function signalValue(item: ScrapedEvidence, trendScore: number) {
  const engagement = item.engagement ?? 0;
  if (engagement <= 0) return clamp(trendScore);
  return clamp(40 + Math.log10(engagement) * 12);
}

function velocityFor(momentum: string) {
  if (momentum === "rising") return 0.25;
  if (momentum === "fading") return -0.12;
  return 0;
}

function growthScore(dish: ScrapedDish) {
  if (dish.momentum === "rising") return 82;
  if (dish.momentum === "fading") return 38;
  return 58;
}

function categoryHint(dish: ScrapedDish) {
  const blob = dishBlob(dish);
  if (/latte|soda|drink|cocktail|coffee|matcha|horchata/.test(blob)) return "drink";
  if (/cookie|cake|scone|dessert|pastry|ice cream/.test(blob)) return "dessert";
  if (/side|fries|elote|pickle/.test(blob)) return "side";
  return "entree";
}

function cuisineFit(dish: ScrapedDish, kitchen: KitchenSnapshot) {
  const cuisine = kitchen.restaurant.cuisine_type?.toLowerCase() ?? "";
  if (!cuisine) return { score: 55, why: "Cuisine not set — treated as unknown" };

  const surface = [dish.name, ...(dish.aliases ?? []), ...(dish.cuisine_tags ?? [])].join(" ").toLowerCase();
  const tags = (dish.cuisine_tags ?? []).map((tag) => tag.toLowerCase());
  const cuisineTokens = tokenize(cuisine);
  const direct = cuisineTokens.some((token) => tags.includes(token) || tokenize(dish.name).includes(token));
  if (direct) return { score: 88, why: `Fits ${kitchen.restaurant.cuisine_type}` };

  const families: Array<{ keys: string[]; hints: string[] }> = [
    { keys: ["noodle", "chinese", "taiwanese", "vietnamese", "thai", "korean", "asian", "japanese"], hints: ["noodle", "pho", "ramen", "bao", "rice", "chili", "soy", "dumpling", "eggplant"] },
    { keys: ["mexican", "tex-mex", "taco"], hints: ["taco", "birria", "elote", "salsa", "barbacoa", "queso"] },
    { keys: ["american", "comfort", "bbq", "southern"], hints: ["chicken", "brisket", "burger", "wings", "sandwich", "bbq", "honey"] },
    { keys: ["italian"], hints: ["pasta", "gnocchi", "risotto", "pizza", "linguine"] },
    { keys: ["cafe", "coffee", "bakery"], hints: ["latte", "matcha", "scone", "cookie", "pastry"] },
  ];
  const family = families.find((row) => row.keys.some((key) => cuisine.includes(key)));
  if (family && family.hints.some((hint) => surface.includes(hint))) {
    return { score: 74, why: `Adjacent to ${kitchen.restaurant.cuisine_type}` };
  }
  return { score: 42, why: `${dish.name} sits outside ${kitchen.restaurant.cuisine_type}` };
}

function goalFit(dish: ScrapedDish, kitchen: KitchenSnapshot, ops: { score: number; missing: string[] }, attached: boolean) {
  const goal = kitchen.restaurant.primary_goal;
  if (!goal) return { score: 55, why: "No monthly goal set" };

  const kind = categoryHint(dish);
  const visual = /visual|shareable|limited|viral|sizzle/.test(dishBlob(dish)) || dish.momentum === "rising";

  switch (goal) {
    case "increase_average_order_value":
      if (kind === "drink" || kind === "dessert" || kind === "side") {
        return { score: 90, why: "Add-on that can lift the check" };
      }
      return { score: 48, why: "A new entree does less for check size than a drink or side" };
    case "generate_social_buzz":
      return {
        score: visual ? 88 : 52,
        why: visual ? "Looks shareable and is still rising" : "Not an obvious social object",
      };
    case "increase_margin":
      return {
        score: clamp(40 + ops.score * 0.5 - ops.missing.length * 6),
        why: ops.missing.length ? "New SKUs eat margin" : "Reuses stock you already buy",
      };
    case "reduce_food_waste":
      return {
        score: ops.missing.length === 0 ? 92 : 40,
        why: ops.missing.length === 0 ? "Uses what is already on the shelf" : "Needs new product in",
      };
    case "increase_slow_period_traffic": {
      const occasions = kitchen.restaurant.service_occasions ?? [];
      const audience = dish.why_trending?.audience?.toLowerCase() ?? "";
      if (occasions.includes("late_night") && /late/.test(audience + dishBlob(dish))) {
        return { score: 86, why: "Fits the slow late-night window" };
      }
      if (occasions.includes("lunch") && /lunch/.test(audience)) {
        return { score: 80, why: "Fits the lunch lull" };
      }
      return { score: 58, why: "Unclear which daypart this fills" };
    }
    case "increase_delivery_sales":
      if (/sandwich|bowl|taco|wings|bao/.test(dishBlob(dish))) {
        return { score: 84, why: "Travels better than a plated special" };
      }
      return { score: 50, why: "Delivery fit is uncertain" };
    case "launch_new_menu_item":
      return { score: attached ? 62 : 84, why: attached ? "Close to something you already sell" : "Genuinely new to the board" };
    case "increase_repeat_customers":
      return { score: attached ? 82 : 50, why: attached ? "A variant regulars can recognize" : "A new SKU is a harder habit change" };
    case "attract_new_customers":
      return { score: dish.momentum === "rising" ? 80 : 60, why: "National heat can pull first-time guests" };
    default:
      return { score: 64, why: "Default revenue goal — no extra filter" };
  }
}

function kitchenFinance(kitchen: KitchenSnapshot): KitchenFinance {
  return {
    experimentBudget: kitchen.finance?.experimentBudget ?? kitchen.restaurant.experiment_budget ?? null,
    maxNewIngredients: kitchen.finance?.maxNewIngredients ?? kitchen.restaurant.max_new_ingredients ?? null,
    maxTrialSpend: kitchen.finance?.maxTrialSpend ?? null,
    capexAvailable: kitchen.finance?.capexAvailable ?? null,
    minDishMarginPct: kitchen.finance?.minDishMarginPct ?? null,
    averageCheck: kitchen.finance?.averageCheck ?? null,
    foodCostPct: kitchen.finance?.foodCostPct ?? null,
  };
}

function financialFit(
  kitchen: KitchenSnapshot,
  economics: ReturnType<typeof profitabilityAndEconomics>,
  newIngredients: string[],
) {
  const finance = kitchenFinance(kitchen);
  const risks: string[] = [];
  let score = 62;
  const launchCost = newIngredients.length * 45;
  const budget = finance.experimentBudget ?? finance.maxTrialSpend ?? null;

  if (budget != null) {
    if (launchCost > budget) {
      score -= 28;
      risks.push(`Launch cost ~$${launchCost} is over the $${Math.round(budget)} experiment budget`);
    } else {
      score += 10;
    }
  }

  if (economics.suggestedPrice != null && economics.estimatedCost != null && economics.suggestedPrice > 0) {
    const foodCost = economics.estimatedCost / economics.suggestedPrice;
    const target = finance.minDishMarginPct != null ? 1 - finance.minDishMarginPct : finance.foodCostPct ?? 0.32;
    if (foodCost > target + 0.05) {
      score -= 16;
      risks.push(`Food cost ${Math.round(foodCost * 100)}% is above the kitchen target`);
    } else {
      score += 8;
    }
  }

  const typicalPrice = median(kitchen.menuItems.map((item) => item.price));
  const check = finance.averageCheck ?? typicalPrice;
  if (check && economics.suggestedPrice != null && economics.suggestedPrice > check * 1.35) {
    score -= 14;
    risks.push(`$${economics.suggestedPrice.toFixed(2)} is well above the current $${check.toFixed(0)} check`);
  }

  if (finance.capexAvailable === 0) {
    // no extra equipment assumed for a garnish/sauce extension
    score += 2;
  }

  const maxNew = finance.maxNewIngredients;
  if (maxNew != null && newIngredients.length > maxNew) {
    score -= 22;
    risks.push(`Needs ${newIngredients.length} new ingredients; cap is ${maxNew}`);
  }

  return {
    score: clamp(score),
    launchCost,
    risks,
    why: budget != null ? `Trial stays against a $${Math.round(budget)} envelope` : "No experiment budget on file",
  };
}

function recommendationType(
  dish: ScrapedDish,
  attached: boolean,
  kitchen: KitchenSnapshot,
): RecommendationType {
  const kind = categoryHint(dish);
  if (kitchen.restaurant.primary_goal === "increase_average_order_value" && (kind === "drink" || kind === "dessert" || kind === "side")) {
    return kind === "drink" ? "drink" : kind === "dessert" ? "dessert" : "add_on";
  }
  if (attached) return "menu_variant";
  if (kind === "drink") return "drink";
  if (kind === "dessert") return "dessert";
  return "limited_time_offer";
}

function typeLabel(type: RecommendationType) {
  switch (type) {
    case "menu_variant":
      return "Menu variant";
    case "limited_time_offer":
      return "Limited-time offer";
    case "add_on":
      return "Add-on";
    case "drink":
      return "Drink add-on";
    case "dessert":
      return "Dessert add-on";
    default:
      return "New menu item";
  }
}

function confidenceFor(params: {
  kitchen: KitchenSnapshot;
  attached: boolean;
  hasIngredients: boolean;
  hasSales: boolean;
  localScore: number;
  identityKnown: boolean;
}) {
  const missing: string[] = [];
  let score = 28;
  if (params.identityKnown) score += 14;
  else missing.push("Kitchen goal and format");
  if (params.kitchen.restaurant.cuisine_type) score += 10;
  else missing.push("Cuisine");
  if (params.hasIngredients) score += 16;
  else missing.push("Ingredient costs");
  if (params.hasSales) score += 14;
  else missing.push("Current sales volume");
  if (params.attached) score += 10;
  if (params.localScore >= 70) score += 8;
  if (params.kitchen.finance?.experimentBudget != null || params.kitchen.restaurant.experiment_budget != null) {
    score += 8;
  } else {
    missing.push("Experiment budget");
  }
  return { score: clamp(score), missing };
}

export function pairDishToKitchen(dish: ScrapedDish, kitchen: KitchenSnapshot): DishPairing {
  const match = bestMenuMatch(dish, kitchen.menuItems);
  const attached = match && match.similarity >= MATCH_FLOOR ? match : null;
  const ops = ingredientOverlap(dish, kitchen);
  const local = localScore(dish, kitchen);
  const identity = identityScore(dish, kitchen);
  const cuisine = cuisineFit(dish, kitchen);
  const goal = goalFit(dish, kitchen, ops, Boolean(attached));
  const economics = profitabilityAndEconomics(dish, attached?.item ?? null, kitchen);
  const money = financialFit(kitchen, economics, ops.missing);
  const trend = clamp(Number(dish.trend_score) || 0);
  const growth = growthScore(dish);
  const similarity = attached ? attached.similarity : (match?.similarity ?? 0);
  const hasIdentity = identity.why !== "No kitchen profile yet";
  const menuFit = round2(0.4 * similarity * 100 + 0.35 * cuisine.score + 0.25 * identity.score);
  const typicalPrice = median(kitchen.menuItems.map((item) => item.price));
  const check = kitchenFinance(kitchen).averageCheck ?? typicalPrice;
  const priceFit =
    economics.suggestedPrice != null && check
      ? clamp(100 - Math.abs(economics.suggestedPrice - check) * 3)
      : 55;

  let overall = round2(
    SCORE_WEIGHTS.trend * trend +
      SCORE_WEIGHTS.growth * growth +
      SCORE_WEIGHTS.operational * ops.score +
      SCORE_WEIGHTS.menuFit * menuFit +
      SCORE_WEIGHTS.financial * money.score +
      SCORE_WEIGHTS.goal * goal.score +
      SCORE_WEIGHTS.local * local.score +
      SCORE_WEIGHTS.price * priceFit,
  );
  if (identity.score <= 12) overall = round2(Math.min(overall, 28));

  const type = recommendationType(dish, Boolean(attached), kitchen);
  const conf = confidenceFor({
    kitchen,
    attached: Boolean(attached),
    hasIngredients: kitchen.ingredients.length > 0,
    hasSales: economics.weeklyUnits != null,
    localScore: local.score,
    identityKnown: Boolean(kitchen.restaurant.primary_goal || kitchen.restaurant.restaurant_type),
  });

  const existingIngredients = kitchen.ingredients
    .filter((ingredient) =>
      tokenize(dish.name).some((token) => tokenize(ingredient.name).includes(token) || ingredient.name.toLowerCase().includes(token)),
    )
    .map((ingredient) => ingredient.name)
    .slice(0, 6);

  const experiment =
    type === "menu_variant"
      ? `4-week limited run as a variant of ${attached?.item.name}`
      : type === "drink" || type === "dessert" || type === "add_on"
        ? "Two-week add-on test on existing tickets"
        : "Weekend special first, then decide on a 4-week LTO";

  const menuName = attached?.item.name ?? null;
  const recommendation = [
    `${typeLabel(type)}: ${dish.name}${menuName ? ` off your ${menuName}` : ""}.`,
    cuisine.why,
    goal.why,
    ops.missing.length
      ? `Reuse ${existingIngredients.join(", ") || "what you already stock"}. Buy ${ops.missing.join(", ")}.`
      : existingIngredients.length
        ? `You already use ${existingIngredients.join(", ")}.`
        : "Ingredient overlap is unknown.",
    economics.suggestedPrice != null && economics.estimatedCost != null
      ? `Price around $${economics.suggestedPrice.toFixed(2)} with food cost near $${economics.estimatedCost.toFixed(2)}.`
      : "No priced pairing yet, so do not treat this as a dollar forecast.",
    money.launchCost != null ? `Estimated launch cost $${money.launchCost}.` : null,
    `Suggested test: ${experiment}.`,
    `Confidence ${conf.score}/100${conf.missing.length ? ` — missing ${conf.missing.join(", ")}` : ""}.`,
  ]
    .filter(Boolean)
    .join(" ");

  const evidence: PairingEvidence[] = [];
  const top = topEvidence(dish.evidence)[0];
  if (top) {
    evidence.push({
      evidence_type: "trend_growth",
      source: top.source === "google_trends" ? "Google Trends" : "YouTube",
      value: top.engagement ?? trend,
      display_value: formatViews(top.engagement) ?? `${Math.round(trend)}`,
      description: top.excerpt.slice(0, 180),
    });
  }
  evidence.push({
    evidence_type: "menu_similarity",
    source: "Kitchen Fit",
    value: cuisine.score / 100,
    display_value: `${Math.round(cuisine.score)}`,
    description: cuisine.why,
  });
  evidence.push({
    evidence_type: "ingredient_overlap",
    source: "Restaurant Inventory",
    value: ops.total ? ops.matched / ops.total : null,
    display_value: ops.total ? `${ops.matched} of ${ops.total}` : "n/a",
    description: ops.missing.length
      ? `New: ${ops.missing.join(", ")}`
      : existingIngredients.length
        ? `Already in: ${existingIngredients.join(", ")}`
        : "No ingredient catalog for this restaurant",
  });
  evidence.push({
    evidence_type: "local_relevance",
    source: "Market",
    value: local.score / 100,
    display_value: `${Math.round(local.score)}`,
    description: local.why,
  });
  evidence.push({
    evidence_type: "margin_impact",
    source: "Goal + Money",
    value: money.score / 100,
    display_value: `${Math.round(goal.score)} / ${Math.round(money.score)}`,
    description: `${goal.why}. ${money.why}.`,
  });
  if (economics.weeklyUnits != null) {
    evidence.push({
      evidence_type: "sales_baseline",
      source: "Sales History",
      value: economics.weeklyUnits,
      display_value: `${Math.round(economics.weeklyUnits)}/week`,
      description: `You sell about ${Math.round(economics.weeklyUnits)} of the matched item per week`,
    });
  }

  return {
    slug: dish.id,
    dishName: dish.name,
    keywords: unique([dish.name, ...(dish.aliases ?? []), ...(dish.cuisine_tags ?? [])]),
    description: dish.why_trending?.summary ?? null,
    trendScore: round2(trend),
    velocity: velocityFor(dish.momentum),
    trendStatus: dish.momentum === "fading" ? "fading" : "active",
    region: local.region,
    menuItemId: attached?.item.id ?? null,
    menuItemName: menuName,
    menuItemPrice: attached?.item.price ?? null,
    scores: {
      trend: round2(trend),
      local: round2(local.score),
      menuFit,
      operational: ops.score,
      profitability: money.score,
      overall,
    },
    suggestedName: dish.name,
    suggestedPrice: economics.suggestedPrice,
    estimatedCost: economics.estimatedCost,
    incrementalRevenue: economics.incrementalRevenue,
    incrementalProfit: economics.incrementalProfit,
    recommendation,
    missingIngredients: ops.missing,
    analysis: {
      recommendationType: type,
      confidence: conf.score,
      cuisineFit: cuisine.score,
      goalFit: goal.score,
      financialFit: money.score,
      existingIngredients,
      newIngredients: ops.missing,
      estimatedLaunchCost: money.launchCost,
      suggestedExperiment: experiment,
      risks: money.risks,
      missingData: conf.missing,
    },
    evidence,
    signals: topEvidence(dish.evidence).map((item, index) => ({
      source: item.source,
      sourceId: sourceIdFor(item, index),
      url: item.url ?? null,
      excerpt: item.excerpt,
      engagement: item.engagement ?? null,
      observedAt: item.observed_at ?? new Date().toISOString(),
      signalValue: signalValue(item, trend),
    })),
  };
}

export function financeFromBudget(budget: BudgetContract | null | undefined): KitchenFinance {
  if (!budget) return {};
  return {
    experimentBudget: budget.allocation?.split?.menu_experimentation ?? budget.constraints?.max_trial_ingredient_spend ?? null,
    maxTrialSpend: budget.constraints?.max_trial_ingredient_spend ?? null,
    capexAvailable: budget.constraints?.capex_available ?? null,
    minDishMarginPct: budget.constraints?.min_dish_margin_pct ?? null,
    averageCheck: budget.allocation?.breakeven?.avg_check ?? null,
    foodCostPct: budget.ratios?.food_cost_pct ?? null,
  };
}

export function pairScrapeToKitchen(dishes: ScrapedDish[], kitchen: KitchenSnapshot) {
  return dishes
    .map((dish) => pairDishToKitchen(dish, kitchen))
    .sort((a, b) => b.scores.overall - a.scores.overall);
}

export function thinKitchen(input: {
  name?: string | null;
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  cuisine?: string | null;
  goal?: string | null;
}): KitchenSnapshot {
  return {
    restaurant: {
      id: "res-thin",
      name: input.name || "Your kitchen",
      city: input.city ?? null,
      state: input.state ?? null,
      neighborhood: input.neighborhood ?? null,
      cuisine_type: input.cuisine ?? null,
      primary_goal: input.goal ?? null,
      pride_in: input.cuisine ?? null,
    },
    menuItems: [],
    ingredients: [],
    inventory: [],
    sales: [],
  };
}
