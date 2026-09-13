import { NextRequest, NextResponse } from "next/server";
import { IdeaRefusedError, inventKitchenIdeas } from "@miseenvue/agent";
import { searchYouTubeClips, youtubeQueries } from "@/lib/youtubeSearch";
import { loadIdeaKitchenFromAuth } from "@/lib/serverKitchen";

export const dynamic = "force-dynamic";

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringList(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return items.length ? items : undefined;
}

function clampSlider(value: unknown, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function asKitchen(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  return {
    name: asString(raw.name),
    city: asString(raw.city),
    cuisine: asString(raw.cuisine),
    occasions: asStringList(raw.occasions),
    priceBand: asString(raw.priceBand),
    neverServe: asString(raw.neverServe),
    prideIn: asString(raw.prideIn),
    goal: asString(raw.goal),
    menu: asStringList(raw.menu) ?? [],
    inventory: asStringList(raw.inventory) ?? [],
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const mood = body.mood === "traditional" || body.mood === "wild" ? body.mood : "balanced";
    const city = asString(body.city);
    const cuisine = asString(body.cuisine);
    const prompt = asString(body.prompt);
    const creativity = clampSlider(body.creativity, mood === "wild" ? 85 : mood === "traditional" ? 20 : 50);
    const fidelity = clampSlider(body.fidelity, 55);
    const mode = body.mode === "menu" ? "menu" : "viral";
    const exclude = Array.isArray(body.exclude)
      ? body.exclude.filter((name: unknown) => typeof name === "string")
      : [];

    const kitchen = (await loadIdeaKitchenFromAuth(req.headers.get("Authorization"))) ?? asKitchen(body.kitchen);

    if (mode === "menu") {
      const result = await inventKitchenIdeas({
        mood,
        city: kitchen?.city ?? city,
        cuisine: kitchen?.cuisine ?? cuisine,
        exclude,
        prompt,
        creativity,
        fidelity,
        kitchen,
      });

      return NextResponse.json({
        success: true,
        mode,
        creativity,
        fidelity,
        engineUsed: result.engineUsed,
        lessons: result.lessons,
        dishes: result.dishes,
        generatedAt: new Date().toISOString(),
      });
    }

    const { clips, note } = await searchYouTubeClips(youtubeQueries(mood, city, cuisine));
    const result = await inventKitchenIdeas({
      mood,
      city,
      cuisine,
      exclude,
      videos: clips.map((clip) => ({
        title: clip.title,
        channel: clip.channel,
        views: clip.views,
        url: clip.url,
        query: clip.query,
      })),
    });

    return NextResponse.json({
      success: true,
      mode,
      mood,
      engineUsed: result.engineUsed,
      note,
      videos: clips,
      lessons: result.lessons,
      dishes: result.dishes,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof IdeaRefusedError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    const raw = error instanceof Error ? error.message : "Idea search failed";
    const message = /authentication_error|API key is invalid/i.test(raw)
      ? "Anthropic rejected the API key. Paste a fresh key from console.anthropic.com into ANTHROPIC_API_KEY."
      : /Gemini authentication/i.test(raw)
        ? "Gemini rejected the API key. Ideas will use Anthropic if ANTHROPIC_API_KEY is set."
        : raw;
    const refused = /only invents food/i.test(raw);
    return NextResponse.json({ success: false, error: message }, { status: refused ? 400 : 500 });
  }
}
