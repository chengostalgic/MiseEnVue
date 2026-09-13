"use client";

import type { Session } from "@supabase/supabase-js";
import { FormEvent, useState } from "react";
import { getSupabaseClient, isLocalDemo, isSupabaseConfigured } from "@/lib/supabase";

type Mode = "sign-in" | "sign-up";

export default function AuthPanel({
  onSignedIn,
}: {
  onSignedIn?: (session: Session) => void;
}) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const demoHint = isLocalDemo();

  function switchMode(nextMode: Mode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setEmail("");
    setPassword("");
    setMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setIsError(false);

    try {
      const supabase = getSupabaseClient();
      const result =
        mode === "sign-up"
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password });

      if (result.error) throw result.error;

      if (mode === "sign-up" && !result.data.session) {
        setMessage("Account created. Check your email to confirm it.");
      } else if (result.data.session) {
        onSignedIn?.(result.data.session);
      }
      setPassword("");
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen flex flex-col bg-white text-neutral-950">
        <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/90 backdrop-blur-md">
          <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-8 lg:px-12 h-14 flex items-center">
            <div className="text-sm font-medium text-neutral-950">MiseEnVue</div>
          </div>
        </header>
        <main className="flex-1 w-full">
          <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-8">
            <section className="max-w-xl rounded-xl border border-neutral-200 bg-white p-5 sm:p-6 space-y-3 shadow-xs">
              <div className="text-[11px] text-[#0047FF] font-semibold uppercase tracking-wider">Sign in</div>
              <h1 className="text-2xl font-light tracking-tight text-neutral-950">Kitchen login is not connected</h1>
              <p className="text-sm text-neutral-500">
                This deploy needs <code className="text-neutral-800">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                <code className="text-neutral-800">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> from a hosted Supabase
                project. A 127.0.0.1 URL will not work on Vercel.
              </p>
            </section>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/90 backdrop-blur-md">
        <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-8 lg:px-12 h-14 flex items-center justify-between">
          <div className="text-sm font-medium text-neutral-950">MiseEnVue</div>
          <div className="flex items-center gap-1.5 bg-[#0047FF] px-3 py-1.5 rounded-full text-white text-xs font-medium">
            {mode === "sign-in" ? "Sign in" : "Create account"}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full">
        <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-8">
          <section className="max-w-xl rounded-xl border border-neutral-200 bg-white p-5 sm:p-6 space-y-5 shadow-xs">
            <div className="space-y-1 pb-1 border-b border-neutral-100">
              <div className="text-[11px] text-[#0047FF] font-semibold uppercase tracking-wider">Welcome</div>
              <h1 className="text-2xl font-light tracking-tight text-neutral-950">
                {mode === "sign-in" ? "Sign in to your kitchen" : "Create your kitchen"}
              </h1>
              <p className="text-sm text-neutral-500">
                Sign in with the same email you used before. We open that kitchen’s board — setup is only for a new account.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`px-3 py-1.5 rounded-[4px] text-xs border transition ${
                  mode === "sign-in"
                    ? "bg-neutral-950 text-white border-neutral-950"
                    : "bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400"
                }`}
                onClick={() => switchMode("sign-in")}
              >
                Sign in
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 rounded-[4px] text-xs border transition ${
                  mode === "sign-up"
                    ? "bg-neutral-950 text-white border-neutral-950"
                    : "bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400"
                }`}
                onClick={() => switchMode("sign-up")}
              >
                Sign up
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block space-y-1.5 text-sm text-neutral-800">
                Email
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="you@yourrestaurant.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label className="block space-y-1.5 text-sm text-neutral-800">
                Password
                <input
                  type="password"
                  autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                  placeholder="At least 6 characters"
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              <button
                className="rounded-[4px] bg-[#0047FF] text-white px-3.5 py-2 text-sm hover:bg-[#0038df] disabled:opacity-60"
                type="submit"
                disabled={loading}
              >
                {loading ? "Working…" : mode === "sign-in" ? "Sign in" : "Create account"}
              </button>
            </form>

            {message ? (
              <p className={`text-sm ${isError ? "text-rose-600" : "text-neutral-600"}`} role={isError ? "alert" : "status"}>
                {message}
              </p>
            ) : null}

            {demoHint ? (
              <p className="text-xs text-neutral-400">
                Local only: <code>owner@miseenvue.test</code> / <code>password123</code>
              </p>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}
