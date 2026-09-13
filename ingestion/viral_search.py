"""On-demand YouTube search for innovative dishes and viral marketing.

    python -m ingestion.viral_search --city Houston --mood wild

Uses google-api-python-client (YouTube Data API v3). This is not the nightly
channel scrape — it is a small, quota-aware search for evidence the roster
never sees: how restaurants sell a drop, and dishes that are not wings.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from ingestion.pipeline import load_env
from ingestion.queries import build_discovery_queries, query_strings
from ingestion.yt_client import search_videos


def queries_for(mood: str, city: str, cuisine: str) -> list[str]:
    return query_strings(build_discovery_queries(city=city, cuisine=cuisine))


def run_search(
    *,
    mood: str = "balanced",
    city: str = "",
    cuisine: str = "",
    max_per_query: int = 5,
) -> dict:
    seen: set[str] = set()
    videos: list[dict] = []
    for query in queries_for(mood, city, cuisine):
        try:
            found = search_videos(query, max_results=max_per_query, order="viewCount")
        except Exception as exc:  # noqa: BLE001 - one query must not kill the batch
            videos.append({"query": query, "error": str(exc)})
            continue
        for video in found:
            if video["id"] in seen:
                continue
            seen.add(video["id"])
            videos.append(video)
    return {
        "mood": mood,
        "city": city,
        "cuisine": cuisine,
        "count": sum(1 for video in videos if video.get("id")),
        "videos": videos,
    }


def main() -> int:
    load_env()
    parser = argparse.ArgumentParser(description="Search YouTube for viral dishes and restaurant marketing.")
    parser.add_argument("--mood", choices=["traditional", "balanced", "wild"], default="balanced")
    parser.add_argument("--city", default=os.environ.get("CITY", ""))
    parser.add_argument("--cuisine", default="")
    parser.add_argument("--out", default="data/out/viral_search.json")
    args = parser.parse_args()

    payload = run_search(mood=args.mood, city=args.city, cuisine=args.cuisine)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2))
    print(f"wrote {payload['count']} videos -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
