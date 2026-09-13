import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { loadRestaurantProfile } from "@/lib/restaurantProfile";

export type CollectionKind = "dish" | "video" | "lesson" | "hidden";

export type CollectionItem = {
  id: string;
  restaurant_id?: string | null;
  kind: CollectionKind;
  title: string;
  summary: string | null;
  source: string | null;
  source_url: string | null;
  source_id: string | null;
  creativity: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

const LOCAL_KEY = "miseenvue.collection";

function localItems(): CollectionItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as CollectionItem[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(items: CollectionItem[]) {
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
}

function table() {
  return (getSupabaseClient() as unknown as { from: (name: string) => any }).from("kitchen_collection");
}

export async function listCollection(): Promise<CollectionItem[]> {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await table().select("*").order("created_at", { ascending: false });
      if (!error && Array.isArray(data)) return data as CollectionItem[];
    } catch {
      // fall through
    }
  }
  return localItems();
}

export async function saveCollectionItem(
  item: Omit<CollectionItem, "id" | "created_at" | "restaurant_id"> & { id?: string },
): Promise<CollectionItem> {
  const row: CollectionItem = {
    id: item.id ?? (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `col-${Date.now()}`),
    restaurant_id: null,
    created_at: new Date().toISOString(),
    ...item,
  };

  if (isSupabaseConfigured()) {
    try {
      const profile = await loadRestaurantProfile();
      if (profile?.id) {
        const { data, error } = await table()
          .upsert(
            {
              restaurant_id: profile.id,
              kind: row.kind,
              title: row.title,
              summary: row.summary,
              source: row.source,
              source_url: row.source_url,
              source_id: row.source_id ?? row.id,
              creativity: row.creativity,
              payload: row.payload ?? {},
            },
            { onConflict: "restaurant_id,kind,source_id" },
          )
          .select("*")
          .maybeSingle();
        if (!error && data) return data as CollectionItem;
      }
    } catch {
      // local fallback
    }
  }

  const current = localItems().filter(
    (existing) => !(existing.kind === row.kind && existing.source_id === row.source_id && row.source_id),
  );
  writeLocal([row, ...current]);
  return row;
}

export async function removeCollectionItem(id: string) {
  if (isSupabaseConfigured()) {
    try {
      const { error } = await table().delete().eq("id", id);
      if (!error) return;
    } catch {
      // local fallback
    }
  }
  writeLocal(localItems().filter((item) => item.id !== id));
}

export function hiddenDishIds(items: CollectionItem[]) {
  return items.filter((item) => item.kind === "hidden").map((item) => item.source_id).filter(Boolean) as string[];
}
