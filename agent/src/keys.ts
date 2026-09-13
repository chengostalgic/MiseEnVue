import fs from "node:fs";
import path from "node:path";

export type Engine = "gemini" | "backboard";

let envLoaded = false;

function ensureEnvLoaded() {
  if (envLoaded) {
    return;
  }
  envLoaded = true;

  // Next.js automatically loads .env files into process.env.
  // This fallback ensures standalone Node CLI runs can safely discover local environment files.
  if (typeof window === "undefined" && !process.env.NEXT_RUNTIME) {
    const candidatePaths = [
      path.resolve(process.cwd(), ".env.local"),
      path.resolve(process.cwd(), ".env"),
      path.resolve(process.cwd(), "frontend/.env.local"),
      path.resolve(process.cwd(), "agent/.env"),
      path.resolve(process.cwd(), "../.env.local"),
      path.resolve(process.cwd(), "../.env"),
    ];

    for (const envPath of candidatePaths) {
      try {
        if (fs.existsSync(/*turbopackIgnore: true*/ envPath)) {
          if (typeof process.loadEnvFile === "function") {
            process.loadEnvFile(envPath);
          }
        }
      } catch {
        // Ignore parsing errors and continue
      }
    }
  }
}

export function getGeminiKey(override?: string) {
  ensureEnvLoaded();
  const key = override || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "Missing GEMINI_API_KEY. Provide it in .env.local, agent/.env, or frontend/.env.local."
    );
  }
  return key;
}

export function getBackboardKey(override?: string) {
  ensureEnvLoaded();
  const key = override || process.env.BACKBOARD_API_KEY;
  if (!key) {
    throw new Error(
      "Missing BACKBOARD_API_KEY. Provide it in .env.local, agent/.env, or frontend/.env.local."
    );
  }
  return key;
}

export function getAnthropicKey() {
  ensureEnvLoaded();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY. Provide it in .env.local, agent/.env, or frontend/.env.local.",
    );
  }
  return key;
}

export function hasAnthropicKey() {
  ensureEnvLoaded();
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getEngineKey(engine: Engine, override?: string) {
  return engine === "gemini" ? getGeminiKey(override) : getBackboardKey(override);
}
