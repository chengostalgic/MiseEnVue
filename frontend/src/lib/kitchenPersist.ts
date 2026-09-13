import { timezoneForState } from "@/lib/restaurantTimezone";
import {
  getServiceClient,
  getUserClient,
  isServiceRoleConfigured,
  type ServerClient,
} from "@/lib/serverSupabase";

export type KitchenWriteInput = {
  name: string;
  city: string;
  state: string;
  neighborhood?: string;
  cuisine: string;
  priceBand?: string;
  occasions?: string[];
  goal?: string;
};

const SELECTS = [
  "id, name, city, state, neighborhood, cuisine_type, restaurant_type, primary_goal, experiment_budget, max_new_ingredients, pride_in, price_band, service_occasions, never_serve, profile_completed_at",
  "id, name, city, state, neighborhood, cuisine_type, pride_in, price_band, service_occasions, never_serve",
  "id, name, city, state, neighborhood, cuisine_type",
  "id, name, city, cuisine_type",
  "id, name",
];

function firstRow<T>(data: unknown): T | null {
  const row = (Array.isArray(data) ? data[0] : data) as T | null;
  return row ?? null;
}

function isMissingColumn(message: string | undefined) {
  return /PGRST204|schema cache|column|does not exist/i.test(message || "");
}

function isDuplicate(error: { code?: string; message?: string } | null) {
  return /23505|409|duplicate|conflict/i.test(`${error?.code ?? ""} ${error?.message ?? ""}`);
}

function kitchenPayloads(input: KitchenWriteInput, ownerId: string) {
  const cuisine = input.cuisine.trim();
  const city = input.city.trim();
  const core = {
    owner_id: ownerId,
    name: input.name.trim(),
    city,
    state: input.state.trim().toUpperCase(),
    cuisine_type: cuisine,
    timezone: timezoneForState(input.state),
  };
  const profile = {
    neighborhood: (input.neighborhood || "").trim() || city,
    pride_in: cuisine,
    price_band: input.priceBand || "mid",
    service_occasions: input.occasions ?? [],
    never_serve: null as string | null,
    profile_completed_at: new Date().toISOString(),
  };
  const extras = {
    restaurant_type: "casual_dining",
    primary_goal: input.goal || "increase_revenue",
    experiment_budget: null as number | null,
    max_new_ingredients: 3,
  };
  return [{ ...core, ...profile, ...extras }, { ...core, ...profile }, { ...core }];
}

export async function readKitchen(client: ServerClient, ownerId?: string) {
  for (const columns of SELECTS) {
    let query = client.from("restaurants").select(columns).limit(1);
    if (ownerId) query = query.eq("owner_id", ownerId);
    const { data, error } = await query;
    if (error && isMissingColumn(error.message)) continue;
    if (error) return { kitchen: null, error: error.message };
    const kitchen = firstRow<Record<string, unknown>>(data);
    if (kitchen && (kitchen.id || kitchen.name)) return { kitchen, error: null };
  }
  return { kitchen: null, error: null };
}

async function findKitchenId(client: ServerClient, ownerId: string) {
  const { data, error } = await client.from("restaurants").select("id").eq("owner_id", ownerId).limit(1);
  if (error && !isMissingColumn(error.message)) return null;
  return firstRow<{ id: string }>(data)?.id ?? null;
}

async function writeKitchen(client: ServerClient, ownerId: string, input: KitchenWriteInput) {
  const payloads = kitchenPayloads(input, ownerId);
  let kitchenId = await findKitchenId(client, ownerId);
  let lastError: { message?: string; code?: string } | null = null;

  for (const fields of payloads) {
    const returning = "id, name, city, state, cuisine_type";
    const result = kitchenId
      ? await client.from("restaurants").update(fields).eq("id", kitchenId).select(returning).limit(1)
      : await client.from("restaurants").insert(fields).select(returning).limit(1);

    if (result.error && isDuplicate(result.error) && !kitchenId) {
      kitchenId = await findKitchenId(client, ownerId);
      if (kitchenId) {
        const again = await client.from("restaurants").update(fields).eq("id", kitchenId).select(returning).limit(1);
        if (!again.error) {
          const kitchen = firstRow<Record<string, unknown>>(again.data);
          if (kitchen) return { kitchen, error: null };
        }
        lastError = again.error;
        continue;
      }
    }

    if (result.error) {
      lastError = result.error;
      if (isMissingColumn(result.error.message)) continue;
      continue;
    }

    const kitchen = firstRow<Record<string, unknown>>(result.data);
    if (kitchen) {
      kitchenId = typeof kitchen.id === "string" ? kitchen.id : kitchenId;
      return { kitchen, error: null };
    }
    if (kitchenId) {
      const read = await readKitchen(client, ownerId);
      if (read.kitchen) return read;
    }
  }

  const existing = await readKitchen(client, ownerId);
  if (existing.kitchen) return existing;
  return { kitchen: null, error: lastError?.message || "Could not save the kitchen." };
}

export async function loadKitchenForToken(authorization: string) {
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const userClient = getUserClient(authorization);
  const { data: auth, error: authError } = await userClient.auth.getUser(token);
  if (authError || !auth.user) {
    return { user: null, kitchen: null, error: "Please sign in again.", status: 401 as const };
  }

  const viaUser = await readKitchen(userClient);
  if (viaUser.kitchen) return { user: auth.user, kitchen: viaUser.kitchen, error: null, status: 200 as const };

  if (isServiceRoleConfigured()) {
    const viaService = await readKitchen(getServiceClient(), auth.user.id);
    if (viaService.kitchen) return { user: auth.user, kitchen: viaService.kitchen, error: null, status: 200 as const };
  }

  return { user: auth.user, kitchen: null, error: null, status: 200 as const };
}

export async function saveKitchenForToken(authorization: string, input: KitchenWriteInput) {
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const userClient = getUserClient(authorization);
  const { data: auth, error: authError } = await userClient.auth.getUser(token);
  if (authError || !auth.user) {
    return { kitchen: null, error: "Please sign in again.", status: 401 as const };
  }

  const viaUser = await writeKitchen(userClient, auth.user.id, input);
  if (viaUser.kitchen) return { kitchen: viaUser.kitchen, error: null, status: 200 as const };

  if (isServiceRoleConfigured()) {
    const viaService = await writeKitchen(getServiceClient(), auth.user.id, input);
    if (viaService.kitchen) return { kitchen: viaService.kitchen, error: null, status: 200 as const };
    return { kitchen: null, error: viaService.error || viaUser.error || "Could not save the kitchen.", status: 400 as const };
  }

  return { kitchen: null, error: viaUser.error || "Could not save the kitchen.", status: 400 as const };
}
