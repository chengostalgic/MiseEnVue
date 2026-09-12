"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import AuthPanel from "@/components/AuthPanel";
import ProductShell from "@/components/ProductShell";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [restaurantCity, setRestaurantCity] = useState<string | null>(null);
  const [checking, setChecking] = useState(isSupabaseConfigured());

  useEffect(() => {
    if (!isSupabaseConfigured()) {
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
    if (!session || !isSupabaseConfigured()) {
      return;
    }

    void getSupabaseClient()
      .from("restaurants")
      .select("name, city")
      .limit(1)
      .then(({ data }) => {
        setRestaurantName(data?.[0]?.name ?? null);
        setRestaurantCity(data?.[0]?.city ?? null);
      });
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

  return (
    <ProductShell
      session={session}
      restaurantName={restaurantName}
      restaurantCity={restaurantCity}
    />
  );
}
