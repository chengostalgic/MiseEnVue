import {
  OCCASIONS,
  PRICE_BANDS,
  PRIMARY_GOALS,
  type RestaurantProfile,
} from "@/lib/restaurantProfile";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

export type IdeaKitchen = {
  name?: string;
  city?: string;
  cuisine?: string;
  occasions?: string[];
  priceBand?: string;
  neverServe?: string;
  prideIn?: string;
  goal?: string;
  menu: string[];
  inventory: string[];
};

export type KitchenFacts = {
  kitchen: IdeaKitchen;
  source: "database" | "profile";
  restaurantId?: string;
  menuCount: number;
};

export function labelPriceBand(id?: string | null) {
  return PRICE_BANDS.find((band) => band.id === id)?.label ?? id ?? "";
}

export function labelOccasion(id: string) {
  return OCCASIONS.find((row) => row.id === id)?.label ?? id;
}

export function labelGoal(id?: string | null) {
  return PRIMARY_GOALS.find((row) => row.id === id)?.label ?? id ?? "";
}

function menuLine(item: { name?: string | null; description?: string | null; category?: string | null }) {
  const name = (item.name || "").trim();
  if (!name) return "";
  const extra = [item.category, item.description].filter(Boolean).join(" — ");
  return extra ? `${name} (${extra})` : name;
}

export function kitchenFromProfile(
  profile?: Partial<RestaurantProfile> | null,
  extras?: { menu?: string[]; inventory?: string[] },
): IdeaKitchen {
  const city = [profile?.neighborhood, profile?.city].filter(Boolean).join(", ");
  return {
    name: profile?.name ?? undefined,
    city: city || undefined,
    cuisine: profile?.cuisine_type ?? undefined,
    occasions: profile?.service_occasions ?? undefined,
    priceBand: profile?.price_band ?? undefined,
    neverServe: profile?.never_serve ?? undefined,
    prideIn: profile?.pride_in ?? undefined,
    goal: profile?.primary_goal ?? undefined,
    menu: extras?.menu ?? [],
    inventory: extras?.inventory ?? [],
  };
}

export async function loadKitchenFacts(profile?: Partial<RestaurantProfile> | null): Promise<KitchenFacts> {
  if (isSupabaseConfigured() && profile?.id) {
    try {
      const client = getSupabaseClient();
      const [menuRes, inventoryRes] = await Promise.all([
        client
          .from("menu_items")
          .select("name, description, category")
          .eq("restaurant_id", profile.id)
          .eq("active", true),
        client
          .from("current_inventory")
          .select("ingredient_name")
          .eq("restaurant_id", profile.id),
      ]);

      const menu = (menuRes.data ?? []).map(menuLine).filter(Boolean);
      const inventory = (inventoryRes.data ?? [])
        .map((row) => (row.ingredient_name || "").trim())
        .filter(Boolean);
      const kitchen = kitchenFromProfile(profile, { menu, inventory });
      return {
        kitchen,
        source: menu.length || inventory.length ? "database" : "profile",
        restaurantId: profile.id,
        menuCount: menu.length,
      };
    } catch {
      // fall through
    }
  }

  const kitchen = kitchenFromProfile(profile);
  return {
    kitchen,
    source: "profile",
    restaurantId: profile?.id,
    menuCount: 0,
  };
}
