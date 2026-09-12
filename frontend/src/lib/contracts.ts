import fs from "node:fs";
import path from "node:path";
import { DATA_OUT_DIR } from "@miseenvue/agent";
import type { BudgetContract, TrendsContract } from "@/lib/contractTypes";

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
