import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

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

export function timezoneForState(state: string) {
  switch ((state || "").toUpperCase()) {
    case "NY":
    case "NJ":
    case "MA":
    case "PA":
    case "FL":
    case "GA":
      return "America/New_York";
    case "CO":
    case "AZ":
      return "America/Denver";
    case "CA":
    case "WA":
    case "OR":
      return "America/Los_Angeles";
    default:
      return "America/Chicago";
  }
}

export function isProfileComplete(row: RestaurantProfile | null | undefined): row is RestaurantProfile {
  if (!row) return false;
  return Boolean(row.name?.trim() && row.city?.trim() && row.cuisine_type?.trim());
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
  if (/PGRST204|schema cache|column/i.test(blob)) {
    return "The local database is missing a field. In the backend folder run: supabase db reset";
  }
  return "Could not save. Sign out, sign in, and try once more.";
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

export function loadLocalProfile(): RestaurantProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as RestaurantProfile) : null;
  } catch {
    return null;
  }
}

export function saveLocalProfile(input: KitchenInput): RestaurantProfile {
  const row = profileFromInput(input, loadLocalProfile()?.id ?? "res-local");
  window.localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(row));
  return row;
}

export async function loadRestaurantProfile() {
  if (!isSupabaseConfigured()) return loadLocalProfile();

  const supabase = getSupabaseClient();
  const selects = [
    PROFILE_SELECT,
    "id, name, city, state, neighborhood, cuisine_type, pride_in, price_band, service_occasions, never_serve, profile_completed_at",
    "id, name, city, state, neighborhood, cuisine_type, pride_in, price_band, service_occasions, never_serve",
    "id, name, city, state, neighborhood, cuisine_type",
  ];

  let lastError: { message?: string } | null = null;
  for (const columns of selects) {
    const result = await supabase.from("restaurants").select(columns).limit(1).maybeSingle();
    if (!result.error) return (result.data as RestaurantProfile | null) ?? null;
    lastError = result.error;
    if (!/PGRST204|schema cache|column|does not exist/i.test(result.error.message || "")) {
      break;
    }
  }

  if (lastError && /JWT|expired|not authenticated|Auth session/i.test(lastError.message || "")) {
    throw new Error("Please sign in again.");
  }
  return null;
}

export async function saveRestaurantProfile(input: KitchenInput) {
  if (!isSupabaseConfigured()) return saveLocalProfile(input);

  const supabase = getSupabaseClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    throw new Error("Please sign in again.");
  }

  const cuisine = input.cuisine.trim();
  const neighborhood = input.neighborhood.trim() || input.city.trim();
  const row = {
    owner_id: auth.user.id,
    name: input.name.trim(),
    city: input.city.trim(),
    state: input.state.trim().toUpperCase(),
    neighborhood,
    cuisine_type: cuisine,
    pride_in: cuisine,
    price_band: input.priceBand,
    service_occasions: input.occasions,
    never_serve: null as string | null,
    restaurant_type: "casual_dining",
    primary_goal: input.goal,
    experiment_budget: null as number | null,
    max_new_ingredients: 3,
    timezone: timezoneForState(input.state),
    profile_completed_at: new Date().toISOString(),
  };

  const existing = await supabase.from("restaurants").select("id").eq("owner_id", auth.user.id).limit(1).maybeSingle();
  if (existing.error && !/PGRST116/.test(existing.error.message)) {
    // keep going — insert/update below will surface a clearer error
  }

  const kitchenId = existing.data?.id ?? null;
  const write = (
    fields: typeof row | Omit<typeof row, "restaurant_type" | "primary_goal" | "experiment_budget" | "max_new_ingredients">,
    columns = "id, name, city, state, neighborhood, cuisine_type, pride_in, price_band, service_occasions, never_serve",
  ) => {
    if (kitchenId) {
      const { owner_id: _owner, ...update } = fields;
      return supabase.from("restaurants").update(update).eq("id", kitchenId).select(columns).maybeSingle();
    }
    return supabase.from("restaurants").insert(fields).select(columns).maybeSingle();
  };

  let result = await write(row);

  if (result.error && /column|schema cache|PGRST204|restaurant_type|primary_goal|experiment_budget|max_new_ingredients/i.test(result.error.message)) {
    const { restaurant_type: _t, primary_goal: _g, experiment_budget: _b, max_new_ingredients: _m, ...core } = row;
    result = await write(core);
  }

  if (result.error && /409|duplicate|conflict|23505/i.test(`${result.error.code} ${result.error.message}`)) {
    const again = await supabase.from("restaurants").select("id").eq("owner_id", auth.user.id).limit(1).maybeSingle();
    if (again.data?.id) {
      const { owner_id: _owner, ...updateFields } = row;
      let update = await supabase.from("restaurants").update(updateFields).eq("id", again.data.id).select(PROFILE_SELECT).maybeSingle();
      if (update.error && /column|schema cache|PGRST204/i.test(update.error.message)) {
        update = await supabase
          .from("restaurants")
          .update(updateFields)
          .eq("id", again.data.id)
          .select("id, name, city, state, neighborhood, cuisine_type")
          .maybeSingle();
      }
      if (update.error) throw new Error(explainKitchenError(update.error));
      if (!update.data) throw new Error("Updated, but we could not read the kitchen back. Refresh the page.");
      return update.data as RestaurantProfile;
    }
  }

  if (result.error && /column|schema cache|PGRST204/i.test(result.error.message || "")) {
    result = await write(row, "id, name, city, state, neighborhood, cuisine_type");
  }

  if (result.error) throw new Error(explainKitchenError(result.error));

  const saved = (result.data as RestaurantProfile | null) ?? profileFromInput(input, kitchenId ?? "res-local");
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(saved));
  }
  return saved;
}
