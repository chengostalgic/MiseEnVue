"use client";

import type { Session } from "@supabase/supabase-js";
import { FormEvent, useState } from "react";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

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
      <div className="notice error" role="alert">
        <strong>Supabase is not configured.</strong>
        <span>
          Copy <code>frontend/.env.local.example</code> to{" "}
          <code>frontend/.env.local</code> and add the local URL and anon key.
        </span>
      </div>
    );
  }

  return (
    <main className="page-shell">
      <section className="auth-card">
        <div className="eyebrow">MiseEnVue</div>
        <h1>Sign in</h1>
        <p className="intro">
          Demo: <code>owner@miseenvue.test</code> / <code>password123</code>
        </p>

        <div className="mode-switch" aria-label="Authentication mode">
          <button
            type="button"
            className={mode === "sign-in" ? "active" : ""}
            onClick={() => switchMode("sign-in")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === "sign-up" ? "active" : ""}
            onClick={() => switchMode("sign-up")}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
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
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Working…" : mode === "sign-in" ? "Sign in" : "Create account"}
          </button>
        </form>

        {message && (
          <div className={`notice ${isError ? "error" : "success"}`} role={isError ? "alert" : "status"}>
            {message}
          </div>
        )}
      </section>
    </main>
  );
}
