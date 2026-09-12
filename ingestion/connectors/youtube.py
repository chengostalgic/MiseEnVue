"""YouTube Data API v3 connector -- the discovery source.

Replaced Reddit, which closed self-service API registration under its
Responsible Builder Policy in late 2025; new OAuth apps now need manual
approval that does not arrive on a hackathon timeline. YouTube issues API
keys instantly with no review, because this only reads public data.

Three calls per run:

  search.list        find recent food videos matching seed queries   100 units
  videos.list        view/like/comment counts for those videos         1 unit
  commentThreads     top comments -- the audience voice                1 unit

Quota is 10,000 units/day, so search is the only call worth counting. Roughly
100 searches a day at 50 results each is far more than a 7-day window needs.

Comments are not optional decoration. Titles and descriptions are creator
marketing copy and skew promotional; the comments are where people say a dish
looks dry or that they are sick of seeing it. Sentiment and negative_theme
come from there.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

from ingestion.connectors.base import Connector
from ingestion.schema import Post

API = "https://www.googleapis.com/youtube/v3"


class YouTubeConnector(Connector):
    name = "youtube"

    def fetch_raw(self, since_days: int) -> list[dict[str, Any]]:
        import requests  # imported late so --offline works without the dep

        key = os.environ.get("YOUTUBE_API_KEY")
        if not key:
            raise RuntimeError(
                "YOUTUBE_API_KEY not set. Create a key at console.cloud.google.com "
                "(enable YouTube Data API v3) and put it in .env"
            )

        published_after = (
            datetime.now(timezone.utc) - timedelta(days=since_days)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")

        per_query = self.config.get("results_per_query", 25)
        comment_limit = self.config.get("comments_per_video", 20)

        # Two query sets answering two different questions. National category
        # searches find dishes rising anywhere, which is where being early
        # comes from. Local searches are templated with the client's city and
        # show what this market actually eats -- and what competitors already
        # serve. Neither alone is enough: a dish trending nationally but absent
        # locally might be an opening or might be a bad fit for the market, and
        # only the local signal tells you which.
        city = self.config.get("city", "")
        queries = [(q, "national") for q in self.config.get("queries", [])]
        if city:
            queries += [
                (t.format(city=city), "local")
                for t in self.config.get("local_query_templates", [])
            ]

        videos: dict[str, dict[str, Any]] = {}
        for query, scope in queries:
            found = requests.get(
                f"{API}/search",
                params={
                    "key": key,
                    "q": query,
                    "part": "snippet",
                    "type": "video",
                    "publishedAfter": published_after,
                    "maxResults": per_query,
                    "relevanceLanguage": "en",
                    "regionCode": self.config.get("region_code", "US"),
                    # Shorts are where the tag spam lives -- generic queries sorted
                    # by view count return engagement bait with #viral #recipe
                    # attached and no dish in them. Excluding short videos filters
                    # nearly all of it. Verified against live results.
                    "videoDuration": self.config.get("duration", "medium"),
                    # Relevance, not viewCount, for the same reason: the highest
                    # view counts belong to huge general channels, not to whoever
                    # is actually cooking the trending dish.
                    "order": self.config.get("order", "relevance"),
                },
                timeout=30,
            )
            found.raise_for_status()
            for item in found.json().get("items", []):
                vid = item["id"]["videoId"]
                snippet = item["snippet"]
                videos[vid] = {
                    "id": vid,
                    "title": snippet["title"],
                    "description": snippet.get("description", ""),
                    "channel": snippet.get("channelTitle", ""),
                    "published_at": snippet["publishedAt"],
                    "url": f"https://www.youtube.com/watch?v={vid}",
                    "matched_query": query,
                    # A video found by both query sets counts as local -- local
                    # relevance is the scarcer, more decision-relevant signal.
                    "scope": "local" if scope == "local" else videos.get(vid, {}).get("scope", "national"),
                }

        if not videos:
            return []

        # Statistics, 50 ids per call (1 unit each -- effectively free).
        ids = list(videos)
        for i in range(0, len(ids), 50):
            chunk = ids[i : i + 50]
            stats = requests.get(
                f"{API}/videos",
                params={"key": key, "id": ",".join(chunk), "part": "statistics"},
                timeout=30,
            )
            stats.raise_for_status()
            for item in stats.json().get("items", []):
                s = item.get("statistics", {})
                videos[item["id"]].update(
                    view_count=int(s.get("viewCount", 0)),
                    like_count=int(s.get("likeCount", 0)),
                    comment_count=int(s.get("commentCount", 0)),
                )

        for vid, video in videos.items():
            video["top_comments"] = self._comments(requests, key, vid, comment_limit)

        return list(videos.values())

    def _comments(self, requests, key: str, video_id: str, limit: int) -> list[str]:
        """Top comments for one video.

        Comments are disabled on plenty of videos and that returns 403. It is
        not an error worth failing a run over -- the video still counts as a
        mention, it just contributes no sentiment.
        """
        try:
            resp = requests.get(
                f"{API}/commentThreads",
                params={
                    "key": key,
                    "videoId": video_id,
                    "part": "snippet",
                    "order": "relevance",
                    "maxResults": limit,
                    "textFormat": "plainText",
                },
                timeout=30,
            )
            if resp.status_code != 200:
                return []
            return [
                item["snippet"]["topLevelComment"]["snippet"]["textDisplay"]
                for item in resp.json().get("items", [])
            ]
        except Exception:
            return []

    def parse(self, raw: list[dict[str, Any]]) -> list[Post]:
        posts = []
        for r in raw:
            text = " ".join(filter(None, [r.get("title"), r.get("description")])).strip()
            if not text:
                continue
            posts.append(
                Post(
                    source=self.name,
                    id=r["id"],
                    url=r.get("url", ""),
                    text=text,
                    created_at=datetime.fromisoformat(
                        r["published_at"].replace("Z", "+00:00")
                    ),
                    # Views, not likes: reach is what predicts a customer walking
                    # in asking for the dish. Percentile-normalized downstream.
                    engagement=r.get("view_count", 0),
                    comments=r.get("top_comments", []),
                    media_type="video",
                    location=r.get("channel"),
                    scope=r.get("scope", "national"),
                )
            )
        return posts
