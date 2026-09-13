import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { timezoneForState } from "@/lib/restaurantTimezone";

export { timezoneForState };

const LOCAL_PROFILE_KEY = "miseenvue.kitchen-profile";

export const PRICE_BANDS = [
  { id: "value", label: "Under $15" },
  { id: "mid", label: "$15–$35" },
  { id: "upscale", label: "$35+" },
] as const;

export const OCCASIONS = [
  { id: "brunch", label: "Brunch" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "late_night", label: "Late night" },
] as const;

export const PRIMARY_GOALS = [
  { id: "increase_revenue", label: "Sell more" },
  { id: "increase_margin", label: "Keep more profit" },
  { id: "generate_social_buzz", label: "Get people talking" },
  { id: "increase_slow_period_traffic", label: "Fill slow hours" },
] as const;

export const RESTAURANT_TYPES = [
  { id: "casual_dining", label: "Casual dining" },
  { id: "fast_casual", label: "Fast casual" },
  { id: "cafe", label: "Cafe" },
  { id: "bar", label: "Bar" },
  { id: "other", label: "Other" },
] as const;

export type PriceBand = (typeof PRICE_BANDS)[number]["id"];
export type ServiceOccasion = (typeof OCCASIONS)[number]["id"];
export type PrimaryGoal = (typeof PRIMARY_GOALS)[number]["id"];

export type RestaurantProfile = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  cuisine_type: string | null;
  restaurant_type: string | null;
  primary_goal: string | null;
  experiment_budget: number | null;
  max_new_ingredients: number | null;
  pride_in: string | null;
  price_band: string | null;
  service_occasions: string[] | null;
  never_serve: string | null;
  profile_completed_at: string | null;
};

const PROFILE_SELECT =
  "id, name, city, state, neighborhood, cuisine_type, restaurant_type, primary_goal, experiment_budget, max_new_ingredients, pride_in, price_band, service_occasions, never_serve, profile_completed_at";

type KitchenInput = {
  name: string;
  city: string;
  state: string;
  neighborhood: string;
  cuisine: string;
  priceBand: string;
  occasions: string[];
  goal: string;
};


export function isProfileComplete(row: RestaurantProfile | null | undefined): row is RestaurantProfile {
  if (!row) return false;
  return Boolean(row.id || row.name?.trim());
}

function profileStorageKeys(userId?: string | null) {
  return userId ? [`${LOCAL_PROFILE_KEY}.${userId}`, LOCAL_PROFILE_KEY] : [LOCAL_PROFILE_KEY];
}

function cacheLocalProfile(row: RestaurantProfile, userId?: string | null) {
  if (typeof window === "undefined") return;
  for (const key of profileStorageKeys(userId)) {
    try {
      window.localStorage.setItem(key, JSON.stringify(row));
    } catch {
      // ignore quota / private mode
    }
  }
}

export function explainKitchenError(error: { code?: string; message?: string; details?: string } | Error | unknown) {
  const blob =
    error instanceof Error
      ? error.message
      : `${(error as { code?: string })?.code ?? ""} ${(error as { message?: string })?.message ?? ""} ${(error as { details?: string })?.details ?? ""}`;

  if (/23503|foreign key|owner_id/i.test(blob)) {
    return "Your login is out of date. That happens after a database reset. Sign out, sign in, and try again.";
  }
  if (/23505|409|duplicate|conflict/i.test(blob)) {
    return "This account already has a kitchen. Sign out, sign in, and you should land on the board.";
  }
  if (/JWT|expired|session|not authenticated|Auth/i.test(blob)) {
    return "Please sign in again.";
  }
  if (/row-level security|42501|permission denied|not allowed/i.test(blob)) {
    return "This login cannot write that kitchen. Sign out and sign in with the account that owns it.";
  }
  if (/PGRST204|schema cache|column/i.test(blob)) {
    return "The database is missing a kitchen field. Save again — we will write only the fields that exist.";
  }
  const trimmed = blob.replace(/\s+/g, " ").trim();
  if (trimmed && !/Could not save/i.test(trimmed)) return trimmed.slice(0, 220);
  return "Could not save the kitchen. Sign out, sign in, and try once more.";
}

function profileFromInput(input: KitchenInput, id: string): RestaurantProfile {
  const cuisine = input.cuisine.trim();
  return {
    id,
    name: input.name.trim(),
    city: input.city.trim(),
    state: input.state.trim().toUpperCase(),
    neighborhood: input.neighborhood.trim() || input.city.trim(),
    cuisine_type: cuisine,
    restaurant_type: "casual_dining",
    primary_goal: input.goal,
    experiment_budget: null,
    max_new_ingredients: 3,
    pride_in: cuisine,
    price_band: input.priceBand,
    service_occasions: input.occasions,
    never_serve: null,
    profile_completed_at: new Date().toISOString(),
  };
}

export function loadLocalProfile(userId?: string | null): RestaurantProfile | null {
  if (typeof window === "undefined") return null;
  for (const key of profileStorageKeys(userId)) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const row = JSON.parse(raw) as RestaurantProfile;
      if (row?.id || row?.name?.trim()) return row;
    } catch {
      continue;
    }
  }
  return null;
}

export function saveLocalProfile(input: KitchenInput): RestaurantProfile {
  const row = profileFromInput(input, loadLocalProfile()?.id ?? "res-local");
  cacheLocalProfile(row);
  return row;
}

function firstKitchen(data: unknown): RestaurantProfile | null {
  const row = (Array.isArray(data) ? data[0] : data) as RestaurantProfile | null;
  return row && (row.id || row.name?.trim()) ? row : null;
}

function isMissingColumn(message: string | undefined) {
  return /PGRST204|schema cache|column|does not exist/i.test(message || "");
}

export async function loadRestaurantProfile() {
  if (!isSupabaseConfigured()) return loadLocalProfile();

  const supabase = getSupabaseClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    throw new Error("Please sign in again.");
  }

  const selects = [
    PROFILE_SELECT,
    "id, name, city, state, neighborhood, cuisine_type, pride_in, price_band, service_occasions, never_serve, profile_completed_at",
    "id, name, city, state, neighborhood, cuisine_type, pride_in, price_band, service_occasions, never_serve",
    "id, name, city, state, neighborhood, cuisine_type",
    "id, name, city, cuisine_type",
    "id, name",
  ];

  for (const columns of selects) {
    const visible = await supabase.from("restaurants").select(columns).limit(1);
    if (visible.error) {
      if (isMissingColumn(visible.error.message)) continue;
      if (/JWT|expired|not authenticated|Auth session/i.test(visible.error.message || "")) {
        throw new Error("Please sign in again.");
      }
      break;
    }
    const row = firstKitchen(visible.data);
    if (row) {
      cacheLocalProfile(row, auth.user.id);
      return row;
    }

    const owned = await supabase.from("restaurants").select(columns).eq("owner_id", auth.user.id).limit(1);
    if (!owned.error) {
      const ownedRow = firstKitchen(owned.data);
      if (ownedRow) {
        cacheLocalProfile(ownedRow, auth.user.id);
        return ownedRow;
      }
    }
    break;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (token) {
    try {
      const response = await fetch("/api/kitchen", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) throw new Error("Please sign in again.");
      if (response.ok) {
        const payload = (await response.json()) as { kitchen?: RestaurantProfile | null };
        if (payload.kitchen && (payload.kitchen.id || payload.kitchen.name)) {
          cacheLocalProfile(payload.kitchen, auth.user.id);
          return payload.kitchen;
        }
      }
    } catch (error) {
      if (error instanceof Error && /sign in again/i.test(error.message)) throw error;
    }
  }

  return loadLocalProfile(auth.user.id);
}

export async function saveRestaurantProfile(input: KitchenInput) {
  if (!isSupabaseConfigured()) return saveLocalProfile(input);

  const supabase = getSupabaseClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const userId = sessionData.session?.user.id;
  if (!token) throw new Error("Please sign in again.");

  const response = await fetch("/api/kitchen", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as
    | { kitchen?: RestaurantProfile | null; error?: string }
    | null;

  if (!response.ok || !payload?.kitchen) {
    throw new Error(payload?.error || "Could not save the kitchen. Sign out, sign in, and try once more.");
  }

  cacheLocalProfile(payload.kitchen, userId);
  return payload.kitchen;
}
