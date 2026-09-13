"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import AuthPanel from "@/components/AuthPanel";
import KitchenIntake from "@/components/KitchenIntake";
import ProductShell from "@/components/ProductShell";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  isProfileComplete,
  loadLocalProfile,
  loadRestaurantProfile,
  type RestaurantProfile,
} from "@/lib/restaurantProfile";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<RestaurantProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [checking, setChecking] = useState(true);
  const [profileReady, setProfileReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setSession({
        access_token: "local-demo-token",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "local-demo-refresh",
        user: {
          id: "demo-operator-01",
          app_metadata: {},
          user_metadata: {},
          aud: "authenticated",
          created_at: new Date().toISOString(),
          email: "owner@miseenvue.test",
        },
      } as Session);
      setChecking(false);
      setProfile(loadLocalProfile());
      setProfileReady(true);
      return;
    }

    const supabase = getSupabaseClient();
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setChecking(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setProfile(loadLocalProfile());
      setProfileReady(true);
      setLoadError(null);
      return;
    }

    if (!session) {
      setProfile(null);
      setProfileReady(false);
      setLoadError(null);
      return;
    }

    setLoadError(null);
    void loadRestaurantProfile()
      .then((row) => setProfile(row))
      .catch(() => {
        setProfile(null);
        setLoadError("Could not load your kitchen. Sign out and sign in again.");
      })
      .finally(() => setProfileReady(true));
  }, [session]);

  if (checking) {
    return (
      <main className="page-shell">
        <div className="session-loading">Checking session…</div>
      </main>
    );
  }

  if (!session) {
    return <AuthPanel onSignedIn={setSession} />;
  }

  if (!profileReady) {
    return (
      <main className="page-shell">
        <div className="session-loading">Loading kitchen…</div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="page-shell">
        <section className="auth-card">
          <h1>Can’t open the kitchen</h1>
          <p className="intro">{loadError}</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => getSupabaseClient().auth.signOut()}
          >
            Sign out
          </button>
        </section>
      </main>
    );
  }

  if (isSupabaseConfigured() && !isProfileComplete(profile) && !editing) {
    return (
      <KitchenIntake
        existing={profile}
        email={session.user.email}
        onSaved={(row) => {
          setProfile(row);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <>
      <div hidden={editing}>
        <ProductShell
          session={session}
          restaurantName={profile?.name ?? "Demo kitchen"}
          restaurantCity={
            profile?.neighborhood && profile?.city && !/^(n\/a|na|none)$/i.test(profile.neighborhood)
              ? `${profile.neighborhood}, ${profile.city}`
              : profile?.city ?? null
          }
          cuisine={profile?.cuisine_type}
          goal={profile?.primary_goal}
          neighborhood={profile?.neighborhood}
          state={profile?.state}
          profile={profile}
          onEditProfile={() => setEditing(true)}
        />
      </div>
      {editing ? (
        <KitchenIntake
          existing={profile}
          email={session.user.email}
          onSaved={(row) => {
            setProfile(row);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}
