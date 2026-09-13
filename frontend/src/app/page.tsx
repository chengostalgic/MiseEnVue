"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import AuthPanel from "@/components/AuthPanel";
import KitchenIntake from "@/components/KitchenIntake";
import ProductShell from "@/components/ProductShell";
import { getSupabaseClient, isLocalDemo, isSupabaseConfigured } from "@/lib/supabase";
import {
  loadLocalProfile,
  loadRestaurantProfile,
  type RestaurantProfile,
} from "@/lib/restaurantProfile";

function AppMessage({ title, children }: { title: string; children?: ReactNode }) {
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
            <div className="text-[11px] text-[#0047FF] font-semibold uppercase tracking-wider">Kitchen</div>
            <h1 className="text-2xl font-light tracking-tight text-neutral-950">{title}</h1>
            {children}
          </section>
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<RestaurantProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [checking, setChecking] = useState(true);
  const [profileReady, setProfileReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (isLocalDemo()) {
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
          email: "local@localhost",
        },
      } as Session);
      setChecking(false);
      setProfile(loadLocalProfile());
      setProfileReady(true);
      return;
    }

    if (!isSupabaseConfigured()) {
      setChecking(false);
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
    if (isLocalDemo()) {
      setProfile(loadLocalProfile());
      setProfileReady(true);
      setLoadError(null);
      return;
    }

    if (!isSupabaseConfigured() || !session) {
      setProfile(null);
      setProfileReady(false);
      setLoadError(null);
      return;
    }

    setLoadError(null);
    void loadRestaurantProfile()
      .then((row) => setProfile(row))
      .catch((error) => {
        setProfile(null);
        setLoadError(error instanceof Error ? error.message : "Please sign in again.");
      })
      .finally(() => setProfileReady(true));
  }, [session]);

  if (checking) {
    return <AppMessage title="Checking session…" />;
  }

  if (!session) {
    return <AuthPanel onSignedIn={setSession} />;
  }

  if (!profileReady) {
    return <AppMessage title="Loading kitchen…" />;
  }

  if (loadError) {
    return (
      <AppMessage title="Can’t open the kitchen">
        <p className="text-sm text-neutral-500">{loadError}</p>
        <button
          className="rounded-[4px] bg-[#0047FF] text-white px-3.5 py-2 text-sm hover:bg-[#0038df]"
          type="button"
          onClick={() => getSupabaseClient().auth.signOut()}
        >
          Sign out
        </button>
      </AppMessage>
    );
  }

  if (!profile && !editing) {
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
          restaurantName={profile?.name ?? "Your kitchen"}
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
