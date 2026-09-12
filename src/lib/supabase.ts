import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../backend/supabase/functions/_shared/db.types";

export type { Database };

export function getSupabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
}

export function getSupabaseKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseKey());
}

let browserClient: SupabaseClient<Database> | undefined;

/**
 * Returns a typed Supabase client. Re-uses instance in browser context.
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();

  if (!url || !key) {
    throw new Error(
      "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  if (typeof window !== "undefined") {
    browserClient ??= createClient<Database>(url, key);
    return browserClient;
  }

  return createClient<Database>(url, key);
}
