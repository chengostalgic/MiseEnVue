import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(here, "../..");
export const DATA_OUT_DIR = path.join(REPO_ROOT, "data", "out");
export const DATA_REPORTS_DIR = path.join(REPO_ROOT, "data", "reports");
export const TRENDS_CONTRACT_PATH = path.join(DATA_OUT_DIR, "trends.json");
