"""YouTube Data API v3 via google-api-python-client.

The live connector still uses requests for the cheap channel pull. This
module is the on-demand search path: innovative dishes and how viral
restaurants actually market them.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


def youtube_service(api_key: str | None = None):
    key = api_key or os.environ.get("YOUTUBE_API_KEY")
    if not key:
        raise RuntimeError(
            "YOUTUBE_API_KEY not set. Create a key at console.cloud.google.com "
            "(enable YouTube Data API v3) and put it in .env"
        )
    return build("youtube", "v3", developerKey=key, cache_discovery=False)


def search_videos(
    query: str,
    *,
    max_results: int = 8,
    order: str = "viewCount",
    published_days: int = 45,
    api_key: str | None = None,
) -> list[dict[str, Any]]:
    published_after = (
        datetime.now(timezone.utc) - timedelta(days=published_days)
    ).strftime("%Y-%m-%dT%H:%M:%SZ")
    service = youtube_service(api_key)
    try:
        response = (
            service.search()
            .list(
                part="snippet",
                q=query,
                type="video",
                maxResults=min(max_results, 15),
                order=order,
                relevanceLanguage="en",
                regionCode="US",
                publishedAfter=published_after,
            )
            .execute()
        )
    except HttpError as exc:
        raise RuntimeError(f"YouTube search failed for {query!r}: {exc}") from exc

    videos = []
    for item in response.get("items", []):
        snippet = item.get("snippet") or {}
        video_id = (item.get("id") or {}).get("videoId")
        if not video_id:
            continue
        videos.append(
            {
                "id": video_id,
                "title": snippet.get("title") or "",
                "description": (snippet.get("description") or "")[:280],
                "channel": snippet.get("channelTitle") or "",
                "published_at": snippet.get("publishedAt"),
                "query": query,
                "url": f"https://www.youtube.com/watch?v={video_id}",
            }
        )
    return hydrate_stats(videos, api_key=api_key)


def hydrate_stats(videos: list[dict[str, Any]], *, api_key: str | None = None) -> list[dict[str, Any]]:
    if not videos:
        return videos
    service = youtube_service(api_key)
    ids = [video["id"] for video in videos]
    try:
        response = (
            service.videos()
            .list(part="statistics,snippet", id=",".join(ids[:50]))
            .execute()
        )
    except HttpError:
        return videos

    by_id = {item["id"]: item for item in response.get("items", [])}
    for video in videos:
        item = by_id.get(video["id"])
        if not item:
            continue
        stats = item.get("statistics") or {}
        video["views"] = int(stats.get("viewCount") or 0)
        video["likes"] = int(stats.get("likeCount") or 0)
        video["comments"] = int(stats.get("commentCount") or 0)
    return videos
