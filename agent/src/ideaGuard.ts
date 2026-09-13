export const FOOD_ONLY_MESSAGE =
  "This only invents food and recipes. Name a plate, an ingredient, or a service constraint.";

const STOP = new Set([
  "a", "an", "the", "and", "or", "but", "for", "with", "without", "from", "into",
  "that", "this", "these", "those", "your", "our", "their", "my", "we", "it",
  "is", "are", "be", "to", "of", "in", "on", "at", "as", "by", "if", "so",
  "just", "really", "very", "super", "please", "something", "anything", "ideas",
  "idea", "invent", "make", "give", "want", "need", "using", "use", "uses",
  "should", "would", "could", "also", "more", "some", "any", "new", "one",
  "six", "plates", "plateable",
]);

const WEAK = new Set([
  "crazy", "wild", "fun", "good", "best", "nice", "cool", "awesome", "amazing",
  "interesting", "random", "ridiculous", "weird", "special", "stuff", "things",
]);

const FOOD_TERMS = [
  "food", "recipe", "dish", "plate", "menu", "cook", "cooking", "kitchen", "chef",
  "ingredient", "sauce", "broth", "stock", "marinade", "rub", "glaze", "dressing",
  "breakfast", "brunch", "lunch", "dinner", "dessert", "snack", "appetizer", "starter",
  "entree", "side", "drink", "cocktail", "mocktail", "latte", "boba",
  "chicken", "beef", "pork", "lamb", "steak", "brisket", "short rib", "ribs",
  "salmon", "tuna", "shrimp", "prawn", "crab", "lobster", "fish", "cod",
  "tofu", "egg", "eggs", "cheese", "butter", "cream", "yogurt", "milk",
  "rice", "noodle", "noodles", "pasta", "bread", "toast", "bun", "tortilla",
  "taco", "pizza", "burger", "sandwich", "salad", "soup", "stew",
  "ramen", "udon", "pho", "dumpling", "bao", "sushi", "poke", "curry",
  "chili", "chile", "pepper", "garlic", "onion", "ginger", "lemon", "lime",
  "tomato", "mushroom", "potato", "corn", "cabbage", "cucumber", "avocado",
  "herbs", "basil", "cilantro", "mint", "sesame", "soy", "miso", "gochujang",
  "honey", "maple", "sugar", "chocolate", "vanilla", "matcha", "coffee",
  "fried", "grilled", "smoked", "braised", "roasted", "pickled", "fermented",
  "spicy", "sweet", "savory", "umami", "crispy", "crunchy", "creamy",
  "vegan", "vegetarian", "gluten", "halal", "kosher",
  "shareable", "share", "leftover", "leftovers", "special", "ltos",
];

const THEME_PHRASES = [
  "late night", "late-night", "date night", "happy hour", "after hours",
  "no fryer", "no new equipment", "on hand", "family style", "for the table",
  "gluten free", "gluten-free", "plant based", "plant-based",
];

const THEME_ALIASES: Record<string, string[]> = {
  photograph: ["photo", "photogenic", "plating", "visual", "camera"],
  photographs: ["photo", "photogenic", "plating", "visual"],
  "late night": ["late-night", "after hours", "midnight", "bar snack"],
  "late-night": ["late night", "after hours", "midnight", "bar snack"],
  shareable: ["share", "for the table", "family style"],
  leftover: ["leftovers", "on hand", "uses up"],
  leftovers: ["leftover", "on hand", "uses up"],
  spicy: ["heat", "chili", "chile", "hot"],
  photogenic: ["photograph", "photo", "plating", "visual"],
};

const NON_FOOD_TASK =
  /\b(write|draft|generate|create|build|code|hack|exploit|debug|explain|summarize|translate|solve)\b[\s\S]{0,80}\b(essay|poem|story|novel|song|lyrics|screenplay|resume|cv|cover letter|email|contract|legal|lawsuit|homework|thesis|code|script|app|website|api|malware|exploit|password|wifi|crypto|token|stock|taxes?|tax return|itinerary|travel plan|workout|homework)\b/i;

const HARD_REFUSE =
  /\b(bomb|explosive|napalm|fentanyl|meth(?:amphetamine)?|cocaine|heroin|ricin|sarin|weaponize|keylogger|ransomware|child porn|csam)\b/i;

const FOOD_SIGNAL = new RegExp(`\\b(${FOOD_TERMS.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");

export type IdeaKitchenHints = {
  cuisine?: string;
  menu?: string[];
  inventory?: string[];
};

export type IdeaPromptGuard = {
  allowed: boolean;
  reason?: string;
  themes: string[];
};

export class IdeaRefusedError extends Error {
  constructor(message = FOOD_ONLY_MESSAGE) {
    super(message);
    this.name = "IdeaRefusedError";
  }
}

export function normalizeIdeaText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = normalizeIdeaText(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function kitchenFoodBlob(kitchen?: IdeaKitchenHints) {
  return normalizeIdeaText(
    [kitchen?.cuisine, ...(kitchen?.menu ?? []), ...(kitchen?.inventory ?? [])].filter(Boolean).join(" "),
  );
}

export function guardIdeaPrompt(prompt?: string, kitchen?: IdeaKitchenHints): IdeaPromptGuard {
  const raw = (prompt || "").trim();
  if (!raw) return { allowed: true, themes: [] };

  if (HARD_REFUSE.test(raw)) {
    return { allowed: false, reason: FOOD_ONLY_MESSAGE, themes: [] };
  }

  const hasFood = FOOD_SIGNAL.test(raw) || THEME_PHRASES.some((phrase) => raw.toLowerCase().includes(phrase));
  if (NON_FOOD_TASK.test(raw) && !hasFood) {
    return { allowed: false, reason: FOOD_ONLY_MESSAGE, themes: [] };
  }

  const themes = extractPromptThemes(raw, kitchen);
  if (!hasFood && !themes.length) {
    return { allowed: false, reason: FOOD_ONLY_MESSAGE, themes: [] };
  }

  return { allowed: true, themes };
}

export function extractPromptThemes(prompt: string, kitchen?: IdeaKitchenHints): string[] {
  const blob = normalizeIdeaText(prompt);
  if (!blob) return [];
  const kitchenBlob = kitchenFoodBlob(kitchen);
  const found: string[] = [];

  for (const phrase of THEME_PHRASES) {
    if (blob.includes(normalizeIdeaText(phrase))) found.push(phrase);
  }

  for (const term of FOOD_TERMS) {
    const key = normalizeIdeaText(term);
    if (key.length < 3 || STOP.has(key) || WEAK.has(key)) continue;
    if (new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(blob)) {
      found.push(key);
    }
  }

  if (kitchenBlob) {
    for (const token of kitchenBlob.split(" ")) {
      if (token.length < 4 || STOP.has(token) || WEAK.has(token)) continue;
      if (new RegExp(`\\b${token}\\b`).test(blob)) found.push(token);
    }
  }

  for (const token of blob.split(" ")) {
    if (token.length < 5 || STOP.has(token) || WEAK.has(token)) continue;
    if (FOOD_SIGNAL.test(token)) found.push(token);
  }

  return unique(found).slice(0, 12);
}

export function dishHonorsPrompt(
  dish: {
    name?: string;
    sellingPoint?: string;
    why?: string;
    spin?: string;
    usesFromKitchen?: string;
    promptHook?: string;
  },
  prompt: string,
  themes: string[],
) {
  if (!themes.length) return true;
  const hook = normalizeIdeaText(dish.promptHook || dish.usesFromKitchen || "");
  const body = normalizeIdeaText(
    [dish.name, dish.sellingPoint, dish.why, dish.spin, dish.usesFromKitchen, dish.promptHook]
      .filter(Boolean)
      .join(" "),
  );
  const promptBlob = normalizeIdeaText(prompt);

  return themes.some((theme) => {
    const aliases = [theme, ...(THEME_ALIASES[theme] ?? [])].map(normalizeIdeaText);
    return aliases.some((alias) => {
      if (!alias) return false;
      const inPrompt = promptBlob.includes(alias) || alias.split(" ").every((part) => promptBlob.includes(part));
      if (!inPrompt) return false;
      return body.includes(alias) || hook.includes(alias) || alias.split(" ").every((part) => body.includes(part));
    });
  });
}
