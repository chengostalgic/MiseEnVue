export { fetchLiveSocialTrends, generateGeminiText } from "./gemini";
export { analyzeTrendSignals } from "./analyze";
export { generateCampaignPlaybook } from "./campaign";
export { getEngineKey, getGeminiKey, getBackboardKey } from "./keys";
export {
  REPO_ROOT,
  DATA_OUT_DIR,
  DATA_REPORTS_DIR,
  TRENDS_CONTRACT_PATH,
} from "./paths";
export type { Engine } from "./keys";
export type { RealtimeSignal, RealtimeTrendResult } from "./types";
