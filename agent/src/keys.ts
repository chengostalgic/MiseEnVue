export type Engine = "gemini" | "backboard";

export function getGeminiKey(override?: string) {
  const key = override || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("Missing GEMINI_API_KEY. Set it in agent/.env or pass an override.");
  }
  return key;
}

export function getBackboardKey(override?: string) {
  const key = override || process.env.BACKBOARD_API_KEY;
  if (!key) {
    throw new Error("Missing BACKBOARD_API_KEY. Set it in agent/.env or pass an override.");
  }
  return key;
}

export function getEngineKey(engine: Engine, override?: string) {
  return engine === "gemini" ? getGeminiKey(override) : getBackboardKey(override);
}
