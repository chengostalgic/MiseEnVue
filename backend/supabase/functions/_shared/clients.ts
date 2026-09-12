// architecture.md §7 — the two ways to reach Postgres, and the line between them.
//
// Both factories read SUPABASE_URL and their key from the environment. The
// Supabase platform injects all three variables into every deployed function,
// and `supabase start` injects the local equivalents, so the same code runs
// against local and hosted projects without a branch.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "./db.types.ts";

export type Client = SupabaseClient<Database>;

// Deno has no browser to persist a session into, and each invocation is
// short-lived, so token refresh would only ever fire mid-request.
const SERVER_AUTH = { persistSession: false, autoRefreshToken: false } as const;

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

/**
 * Client for user-facing functions. Forwards the caller's JWT, so every query
 * is filtered by that user's RLS policies exactly as it would be from the
 * browser. Use this everywhere except `job-*` functions.
 */
export function anonClient(req: Request): Client {
  const authorization = req.headers.get("Authorization");
  if (!authorization) {
    throw new Error("Missing Authorization header");
  }

  return createClient<Database>(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: SERVER_AUTH,
    global: { headers: { Authorization: authorization } },
  });
}

/**
 * Client for `job-*` functions only. The service role bypasses RLS, so a
 * user-facing endpoint built on this has no authorization at all.
 */
export function serviceClient(): Client {
  return createClient<Database>(
    env("SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: SERVER_AUTH },
  );
}
