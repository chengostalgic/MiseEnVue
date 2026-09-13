import { generateLiveText } from "./generate";
import {
  dishHonorsPrompt,
  guardIdeaPrompt,
  IdeaRefusedError,
  type IdeaKitchenHints,
} from "./ideaGuard";
import { kitchenIdeasPrompt, menuIdeasPrompt, type IdeaMood } from "./prompts";

export type KitchenIdea = {
  name: string;
  sellingPoint: string;
  why: string;
  spin: string;
  marketingMove: string;
  usesFromKitchen?: string;
  promptHook?: string;
  momentum: "rising" | "steady" | "fading";
};

export type MarketingLesson = {
  title: string;
  takeaway: string;
  sourceUrl?: string;
};

type IdeaInput = {
  mood?: IdeaMood;
  city?: string;
  cuisine?: string;
  exclude?: string[];
  videos?: Array<{ title: string; channel?: string; views?: number; url?: string; query?: string }>;
  apiKey?: string;
  prompt?: string;
  creativity?: number;
  fidelity?: number;
  kitchen?: {
    name?: string;
    city?: string;
    cuisine?: string;
    occasions?: string[];
    priceBand?: string;
    neverServe?: string;
    prideIn?: string;
    goal?: string;
    menu?: string[];
    inventory?: string[];
  };
};

function parsePayload(text: string): {
  refused?: boolean;
  reason?: string;
  dishes?: Array<Partial<KitchenIdea>>;
  lessons?: Array<Partial<MarketingLesson>>;
} | null {
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

function kitchenHints(input: IdeaInput): IdeaKitchenHints {
  return {
    cuisine: input.kitchen?.cuisine ?? input.cuisine,
    menu: input.kitchen?.menu,
    inventory: input.kitchen?.inventory,
  };
}

async function runIdeaPass(input: IdeaInput, themes: string[], stricter: boolean) {
  const mood = input.mood ?? "balanced";
  const creativity = input.creativity ?? (mood === "wild" ? 85 : mood === "traditional" ? 20 : 50);
  const fidelity = stricter ? Math.max(input.fidelity ?? 55, 80) : (input.fidelity ?? 55);
  const useMenuPrompt = Boolean(input.prompt?.trim() || input.kitchen);
  const prompt = useMenuPrompt
    ? menuIdeasPrompt({
        prompt: input.prompt,
        creativity,
        fidelity,
        exclude: input.exclude,
        themes,
        kitchen: input.kitchen ?? { city: input.city, cuisine: input.cuisine },
      })
    : kitchenIdeasPrompt({ ...input, mood });

  const { text, engine } = await generateLiveText(prompt, {
    apiKey: input.apiKey,
    temperature: stricter ? 0.15 : 0.2 + (Math.max(0, Math.min(100, creativity)) / 100) * 0.8,
    maxOutputTokens: 2200,
    search: !useMenuPrompt,
  });

  const parsed = parsePayload(text);
  if (parsed?.refused) {
    throw new IdeaRefusedError(parsed.reason);
  }

  const operator = input.prompt?.trim() || "";
  const dishes = (parsed?.dishes ?? [])
    .map((dish) => {
      const promptHook = (dish.promptHook || "").trim() || undefined;
      return {
        name: (dish.name || "").trim(),
        sellingPoint: (dish.sellingPoint || dish.marketingMove || "").trim(),
        why: (dish.why || "").trim(),
        spin: (dish.spin || "").trim(),
        marketingMove: (dish.marketingMove || "").trim(),
        usesFromKitchen: (dish.usesFromKitchen || "").trim() || promptHook,
        promptHook,
        momentum: dish.momentum === "steady" || dish.momentum === "fading" ? dish.momentum : "rising" as const,
      };
    })
    .filter((dish) => dish.name.length > 1)
    .filter((dish) => !operator || dishHonorsPrompt(dish, operator, themes));

  const lessons = (parsed?.lessons ?? [])
    .map((lesson) => ({
      title: (lesson.title || "").trim(),
      takeaway: (lesson.takeaway || "").trim(),
      sourceUrl: lesson.sourceUrl,
    }))
    .filter((lesson) => lesson.title && lesson.takeaway);

  return { dishes, lessons, engineUsed: engine };
}

export async function inventKitchenIdeas(input: IdeaInput) {
  const gate = guardIdeaPrompt(input.prompt, kitchenHints(input));
  if (!gate.allowed) throw new IdeaRefusedError(gate.reason);

  const first = await runIdeaPass(input, gate.themes, false);
  if (first.dishes.length >= 3 || !input.prompt?.trim() || !gate.themes.length) {
    if (!first.dishes.length) throw new Error("Idea pass returned no dishes");
    return first;
  }

  const retry = await runIdeaPass(input, gate.themes, true);
  const dishes = retry.dishes.length ? retry.dishes : first.dishes;
  if (!dishes.length) {
    throw new Error("Those plates did not stick to the ingredients or themes in your prompt. Try naming the food more directly.");
  }
  return { ...retry, dishes };
}
