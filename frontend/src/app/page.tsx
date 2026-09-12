"use client";

import type { Session } from "@supabase/supabase-js";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

type Mode = "sign-in" | "sign-up";

export default function Home() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(isSupabaseConfigured());
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function switchMode(nextMode: Mode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setEmail("");
    setPassword("");
    setMessage(null);
  }

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }

    const supabase = getSupabaseClient();
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setCheckingSession(false);
    });

    return () => subscription.unsubscribe();
  }, []);

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
      } else {
        setMessage(
          mode === "sign-up"
            ? "Account created and signed in."
            : "Signed in successfully.",
        );
      }
      setPassword("");
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    setLoading(true);
    setMessage(null);
    const { error } = await getSupabaseClient().auth.signOut();
    setLoading(false);

    if (error) {
      setIsError(true);
      setMessage(error.message);
      return;
    }

    setIsError(false);
    setMessage("Signed out.");
  }

  return (
    <main className="page-shell">
      <section className="auth-card">
        <div className="eyebrow">MiseEnVue</div>
        <h1>Supabase Auth Test</h1>
        <p className="intro">
          Create an account, sign in, and verify that Supabase keeps your session.
        </p>

        {!isSupabaseConfigured() ? (
          <div className="notice error" role="alert">
            <strong>Supabase is not configured.</strong>
            <span>
              Copy <code>.env.local.example</code> to <code>.env.local</code>{" "}
              and add your project URL and publishable key.
            </span>
          </div>
        ) : checkingSession ? (
          <div className="session-loading">Checking session…</div>
        ) : session ? (
          <div className="session-panel">
            <div className="status-row">
              <span className="status-dot" />
              <span>Authenticated</span>
            </div>
            <dl>
              <div>
                <dt>Email</dt>
                <dd>{session.user.email ?? "No email"}</dd>
              </div>
              <div>
                <dt>User ID</dt>
                <dd>{session.user.id}</dd>
              </div>
            </dl>
            <button
              className="secondary-button"
              type="button"
              onClick={handleSignOut}
              disabled={loading}
            >
              {loading ? "Signing out…" : "Sign out"}
            </button>
          </div>
        ) : (
          <>
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
                  autoComplete={
                    mode === "sign-up" ? "new-password" : "current-password"
                  }
                  placeholder="At least 6 characters"
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              <button className="primary-button" type="submit" disabled={loading}>
                {loading
                  ? "Working…"
                  : mode === "sign-in"
                    ? "Sign in"
                    : "Create account"}
              </button>
            </form>
          </>
        )}

        {message && (
          <div
            className={`notice ${isError ? "error" : "success"}`}
            role={isError ? "alert" : "status"}
          >
            {message}
          </div>
        )}
      </section>
    </main>
  );
}
