import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@miseenvue/agent";
import { extractAsks } from "@/lib/desires";
import { readTrendsContract } from "@/lib/contracts";
import type { AudienceAsk, LabPost, SignalLab } from "@/lib/signalLabTypes";

export type { AudienceAsk, LabPost, SignalLab } from "@/lib/signalLabTypes";

type RawVideo = {
  id?: string;
  title?: string;
  channel?: string;
  url?: string;
  view_count?: number;
  views?: number;
  matched_query?: string;
  top_comments?: string[];
  comments?: string[];
};

function videoIdFromUrl(url: string) {
  const match = url.match(/(?:v=|\/shorts\/)([A-Za-z0-9_-]{6,})/);
  return match?.[1] ?? "";
}

function readJsonVideos(filePath: string): RawVideo[] {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return Array.isArray(data) ? (data as RawVideo[]) : [];
  } catch {
    return [];
  }
}

function newestYoutubeRaw(): { videos: RawVideo[]; rawPath: string } {
  const cacheDir = path.join(REPO_ROOT, "data", "raw", "youtube");
  if (fs.existsSync(cacheDir)) {
    const pulls = fs.readdirSync(cacheDir).filter((name) => name.endsWith(".json")).sort();
    if (pulls.length) {
      const rawPath = path.join(cacheDir, pulls[pulls.length - 1]);
      return { videos: readJsonVideos(rawPath), rawPath };
    }
  }
  return { videos: [], rawPath: "" };
}

function fate(asks: AudienceAsk[], dishName: string | null) {
  if (dishName && asks.length) return "shown — comments also asked for a twist";
  if (dishName) return "shown to operator — no ask extracted";
  if (asks.length) return "ask captured — no dish card shipped";
  return "raw only — not clustered, not shown";
}

export function buildSignalLab(): SignalLab {
  const { videos, rawPath } = newestYoutubeRaw();
  const dishes = readTrendsContract()?.dishes ?? [];
  const byId = new Map<string, { id: string; name: string }>();
  for (const dish of dishes) {
    for (const item of dish.evidence ?? []) {
      const id = videoIdFromUrl(item.url || "");
      if (id) byId.set(id, { id: dish.id, name: dish.name });
    }
  }

  const posts: LabPost[] = [];
  const asks: SignalLab["asks"] = [];
  for (const video of videos) {
    const id = String(video.id || "");
    const comments = (video.top_comments ?? video.comments ?? []).filter(Boolean);
    const found = extractAsks(comments);
    const dish = byId.get(id) ?? null;
    const post: LabPost = {
      id,
      title: video.title || "",
      channel: video.channel || "",
      url: video.url || (id ? `https://www.youtube.com/watch?v=${id}` : ""),
      views: video.view_count ?? video.views ?? 0,
      query: video.matched_query || "",
      comments,
      asks: found,
      operatorDish: dish?.name ?? null,
      operatorDishId: dish?.id ?? null,
      fate: fate(found, dish?.name ?? null),
    };
    posts.push(post);
    for (const ask of found) {
      asks.push({
        ...ask,
        videoId: id,
        videoTitle: post.title,
        url: post.url,
        operatorDish: post.operatorDish,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    rawPath,
    source: "youtube",
    videoCount: posts.length,
    commentCount: posts.reduce((sum, post) => sum + post.comments.length, 0),
    askCount: asks.length,
    shownToOperator: posts.filter((post) => post.operatorDish).length,
    asksNotShipped: asks.filter((ask) => !ask.operatorDish).length,
    posts,
    asks,
  };
}
