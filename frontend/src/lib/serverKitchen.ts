import { kitchenFromProfile, type IdeaKitchen } from "@/lib/kitchenFacts";
import { getUserClient, isServerSupabaseConfigured } from "@/lib/serverSupabase";

function menuLine(item: { name?: string | null; description?: string | null; category?: string | null }) {
  const name = (item.name || "").trim();
  if (!name) return "";
  const extra = [item.category, item.description].filter(Boolean).join(" — ");
  return extra ? `${name} (${extra})` : name;
}

export async function loadIdeaKitchenFromAuth(authorization: string | null): Promise<IdeaKitchen | null> {
  if (!authorization || !isServerSupabaseConfigured()) return null;

  const client = getUserClient(authorization);
  const { data: restaurants, error } = await client
    .from("restaurants")
    .select(
      "id, name, city, state, neighborhood, cuisine_type, pride_in, price_band, service_occasions, never_serve, primary_goal",
    )
    .limit(1);
  if (error || !restaurants?.[0]) return null;

  const profile = restaurants[0];
  const [menuRes, inventoryRes] = await Promise.all([
    client
      .from("menu_items")
      .select("name, description, category")
      .eq("restaurant_id", profile.id)
      .eq("active", true),
    client.from("current_inventory").select("ingredient_name").eq("restaurant_id", profile.id),
  ]);

  const menu = (menuRes.data ?? []).map(menuLine).filter(Boolean);
  const inventory = (inventoryRes.data ?? [])
    .map((row) => (row.ingredient_name || "").trim())
    .filter(Boolean);

  return kitchenFromProfile(profile, { menu, inventory });
}
