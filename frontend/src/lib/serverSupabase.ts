import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../backend/supabase/functions/_shared/db.types";

export type ServerClient = SupabaseClient<Database>;

function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function anonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function isPlaceholder(value: string | undefined) {
  return !value || /replace-with|your-publishable|changeme/i.test(value);
}

export function isServerSupabaseConfigured() {
  return !isPlaceholder(supabaseUrl()) && !isPlaceholder(anonKey());
}

export function isServiceRoleConfigured() {
  return isServerSupabaseConfigured() && !isPlaceholder(serviceKey());
}

const AUTH = { persistSession: false, autoRefreshToken: false } as const;

export function getServiceClient(): ServerClient {
  const url = supabaseUrl();
  const key = serviceKey();
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient<Database>(url, key, { auth: AUTH });
}

export function getUserClient(authorization: string): ServerClient {
  const url = supabaseUrl();
  const key = anonKey();
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return createClient<Database>(url, key, {
    auth: AUTH,
    global: { headers: { Authorization: authorization } },
  });
}
