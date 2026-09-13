import fs from "node:fs";
import path from "node:path";
import { DATA_OUT_DIR } from "@miseenvue/agent";
import type { BudgetContract, ScrapedDish, TrendsContract } from "@/lib/contractTypes";

export type { BudgetContract, ScrapedDish, ScrapedEvidence, TrendsContract } from "@/lib/contractTypes";

const TRENDS_FILE = path.join(DATA_OUT_DIR, "trends.json");
const BUDGET_FILE = path.join(DATA_OUT_DIR, "budget.json");

function readJson(filePath: string) {
  if (!fs.existsSync(/*turbopackIgnore: true*/ filePath)) return null;
  return JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ filePath, "utf-8"));
}

export function readTrendsContract(): TrendsContract | null {
  const data = readJson(TRENDS_FILE);
  if (!data || !Array.isArray(data.dishes)) return null;
  return data as TrendsContract;
}

export function readBudgetContract(): BudgetContract | null {
  return readJson(BUDGET_FILE) as BudgetContract | null;
}

function isLocalDish(dish: ScrapedDish) {
  return (dish.metrics?.by_source?.google_maps ?? 0) > 0 || (dish.metrics?.local_restaurant_count ?? 0) > 0;
}

export function loadScrapeDishes(_input?: string | {
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  cuisine?: string | null;
}): {
  dishes: ScrapedDish[];
  market: TrendsContract["market"] | null;
  nationalCount: number;
  localCount: number;
  sourcesUsed: string[];
  fixture: boolean;
} {
  const contract = readTrendsContract();
  const dishes = contract?.dishes ?? [];
  const localCount = dishes.filter(isLocalDish).length;
  return {
    dishes,
    market: contract?.market ?? null,
    nationalCount: dishes.length - localCount,
    localCount,
    sourcesUsed: contract?.sources_used ?? [],
    fixture: Boolean(contract?._meta?.fixture),
  };
}
