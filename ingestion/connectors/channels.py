"""Channel-based discovery -- the cheap path to US food content.

`search.list` costs 100 quota units per call. `playlistItems.list` costs 1, and
every channel has an "uploads" playlist containing everything it has posted.
So pulling the recent uploads of 30 curated channels costs roughly 60 units and
returns ~1,500 videos, where 24 keyword searches cost 2,400 units and returned
~300.

It is also better content. Keyword search has no reliable origin filter, so a
search-only pull was roughly a third non-US home cooking that had to be
filtered back out downstream. A curated channel list has the origin question
answered before the first request.

The tradeoff is honest: this sees only what these channels post. It is a
recall/precision trade, and for "what are US food creators making right now"
the curated list IS the signal. Keyword search stays available for discovering
dishes outside the roster -- just at a much lower query count.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

API = "https://www.googleapis.com/youtube/v3"
PLAYLIST_CACHE = Path("data/raw/channel_playlists.json")


def fetch_channel_uploads(
    requests, key: str, handles: list[str], since_days: int, per_channel: int = 50
) -> list[dict[str, Any]]:
    """Recent uploads across the given channel handles.

    Returns raw video dicts in the same shape the search path produces, so the
    rest of the connector does not care which discovery route found a video.
    """
    if not handles:
        return []

    uploads = _resolve_uploads_playlists(requests, key, handles)
    if not uploads:
        return []

    cutoff = datetime.now(timezone.utc) - timedelta(days=since_days)
    videos: list[dict[str, Any]] = []

    for handle, (playlist_id, channel_id, title) in uploads.items():
        try:
            resp = requests.get(
                f"{API}/playlistItems",
                params={
                    "key": key,
                    "playlistId": playlist_id,
                    "part": "snippet",
                    "maxResults": min(per_channel, 50),
                },
                timeout=30,
            )
            if resp.status_code != 200:
                continue
        except Exception:  # noqa: BLE001 - one dead channel must not kill a run
            continue

        for item in resp.json().get("items", []):
            sn = item["snippet"]
            published = sn.get("publishedAt", "")
            # playlistItems has no publishedAfter parameter, so the window is
            # applied here. Uploads come back newest-first, so the first miss
            # means the rest of this channel is older too.
            if not published:
                continue
            if datetime.fromisoformat(published.replace("Z", "+00:00")) < cutoff:
                break

            vid = sn.get("resourceId", {}).get("videoId")
            if not vid:
                continue
            videos.append({
                "id": vid,
                "title": sn.get("title", ""),
                "description": sn.get("description", ""),
                "channel": title,
                "channel_id": channel_id,
                "published_at": published,
                "url": f"https://www.youtube.com/watch?v={vid}",
                "matched_query": f"channel:{handle}",
                # Curated channels are US food media by construction; that is
                # the whole point of the roster.
                "scope": "national",
                "from_channel": True,
            })

    return videos


def _resolve_uploads_playlists(
    requests, key: str, handles: list[str]
) -> dict[str, tuple[str, str, str]]:
    """handle -> (uploads_playlist_id, channel_id, title).

    Cached on disk because the mapping never changes and resolving costs a
    request per handle.
    """
    cache: dict[str, list[str]] = {}
    if PLAYLIST_CACHE.is_file():
        try:
            cache = json.loads(PLAYLIST_CACHE.read_text())
        except (json.JSONDecodeError, OSError):
            cache = {}

    resolved: dict[str, tuple[str, str, str]] = {
        h: tuple(cache[h]) for h in handles if h in cache and len(cache[h]) == 3
    }

    missing = [h for h in handles if h not in resolved]
    for handle in missing:
        try:
            resp = requests.get(
                f"{API}/channels",
                params={"key": key, "forHandle": handle, "part": "contentDetails,snippet"},
                timeout=30,
            )
            if resp.status_code != 200:
                continue
            items = resp.json().get("items", [])
            if not items:
                print(f"  [channels] handle not found: {handle}")
                continue
            it = items[0]
            entry = (
                it["contentDetails"]["relatedPlaylists"]["uploads"],
                it["id"],
                it["snippet"]["title"],
            )
            resolved[handle] = entry
            cache[handle] = list(entry)
        except Exception:  # noqa: BLE001
            continue

    if missing:
        PLAYLIST_CACHE.parent.mkdir(parents=True, exist_ok=True)
        PLAYLIST_CACHE.write_text(json.dumps(cache, indent=2))

    return resolved
