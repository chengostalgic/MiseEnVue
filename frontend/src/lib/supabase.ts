"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../backend/supabase/functions/_shared/db.types";

export type { Database };

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function getSupabaseKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

function isPlaceholder(value: string) {
  return /replace-with|your-publishable|changeme/i.test(value);
}

export function isLocalApp() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function supabaseUrlIsLocal(url: string) {
  return /127\.0\.0\.1|localhost/.test(url);
}

export function isSupabaseConfigured() {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key || isPlaceholder(url) || isPlaceholder(key)) return false;

  if (supabaseUrlIsLocal(url)) {
    if (process.env.VERCEL) return false;
    if (typeof window !== "undefined" && !isLocalApp()) return false;
  }

  return true;
}

export function isLocalDemo() {
  return isLocalApp() && !isSupabaseConfigured();
}

let client: SupabaseClient<Database> | undefined;

export function getSupabaseClient(): SupabaseClient<Database> {
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseKey();

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  client ??= createClient<Database>(supabaseUrl, supabaseKey);
  return client;
}
