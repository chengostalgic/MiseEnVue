"""YouTube Data API v3 connector -- the discovery source.

Replaced Reddit, which closed self-service API registration under its
Responsible Builder Policy in late 2025; new OAuth apps now need manual
approval that does not arrive on a hackathon timeline. YouTube issues API
keys instantly with no review, because this only reads public data.

DISCOVERY IS CHANNEL-FIRST, NOT SEARCH-FIRST.

  playlistItems      recent uploads from curated channels               1 unit
  videos.list        view/like/comment counts + language                1 unit
  channels.list      channel country, for the origin gate               1 unit
  commentThreads     top comments -- the audience voice                 1 unit
  search.list        SUPPLEMENT only: dishes outside the roster       100 units

Quota is 10,000 units/day and search is the only call that meaningfully spends
it. Pulling ~300 videos from 19 curated channels costs ~40 units; the same
volume via keyword search cost ~2,400 and returned worse content, because
search has no reliable origin filter.

Search is isolated per query: it is the first thing to 429 when the budget runs
down, and a failure there must not discard the channel results.

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
from ingestion.connectors.channels import fetch_channel_uploads
from ingestion.virality import annotate as annotate_virality
from ingestion.schema import Post

API = "https://www.googleapis.com/youtube/v3"

# Narrowest geographic scope wins when a video is found by several query sets.
_SCOPE_RANK = {"local": 0, "regional": 1, "national": 2}


def _language_ok(lang: str | None, allowed: list[str]) -> bool:
    """Match on the primary subtag so en-US and en-GB both pass an "en" rule.

    Unset language passes: it is missing metadata, not evidence of origin.
    """
    if not lang:
        return True
    return lang.split("-")[0].lower() in {a.split("-")[0].lower() for a in allowed}


def _narrowest(*scopes: str | None) -> str:
    """Most specific of the given scopes; national when none are given."""
    present = [s for s in scopes if s]
    return min(present, key=lambda s: _SCOPE_RANK.get(s, 9)) if present else "national"


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
        region = self.config.get("region_name", "")
        queries = [(q, "national") for q in self.config.get("queries", [])]
        if region:
            queries += [
                (t.format(region=region), "regional")
                for t in self.config.get("regional_query_templates", [])
            ]
        if city:
            queries += [
                (t.format(city=city), "local")
                for t in self.config.get("local_query_templates", [])
            ]

        # Each query runs under BOTH orderings, because they select for
        # different failure modes:
        #
        #   relevance  ranks on keyword match, so it favours keyword-stuffed
        #              titles from tiny channels ("Dubai Viral Qishta Recipe |
        #              5 Minutes Trending Arabic Dessert"). Good topical fit,
        #              systematically biased AGAINST big creators, who write
        #              natural titles that match less literally.
        #   viewCount  ranks on actual audience, which is what "trending" means
        #              -- but pulls in engagement bait, which the language and
        #              engagement gates downstream remove.
        #
        # A relevance-only pull returned a median of 124 views and nothing over
        # 1M. The dish with the largest real audience in that pull (a 241k-view
        # chicken au poivre Short) was buried under an 11-video cluster with
        # 11,400 views between them.
        orders = self.config.get("orders", ["relevance", "viewCount"])

        videos: dict[str, dict[str, Any]] = {}

        # Curated channels first -- ~1 quota unit each against search's 100,
        # and the origin question is already answered by the roster.
        for video in fetch_channel_uploads(
            requests, key,
            self.config.get("channels", []),
            self.config.get("channel_window_days", since_days),
            self.config.get("channel_videos_each", 50),
        ):
            videos[video["id"]] = video
        if videos:
            print(f"  [{self.name}] {len(videos)} videos from curated channels")

        # Search is a SUPPLEMENT and fails routinely -- it costs 100 quota
        # units a call, so it is the first thing to 429 once the daily budget
        # runs down. A failure here must not discard the channel results
        # already collected above, which are the main path and cost almost
        # nothing. Each query is therefore isolated.
        search_failures = 0
        for query, scope in queries:
            for order in orders:
                if not self._search_into(
                    videos, requests, key, query, scope, order,
                    published_after, per_query,
                ):
                    search_failures += 1

        if search_failures:
            print(
                f"  [{self.name}] {search_failures} supplementary search(es) failed "
                f"(usually quota); continuing with {len(videos)} videos"
            )

        # Shorts come in through their own pass and are gated on engagement
        # rate below, after statistics land -- the gate needs like and comment
        # counts, which the search response does not carry.
        shorts: dict[str, dict[str, Any]] = {}
        if self.config.get("include_shorts", True):
            shorts = self._fetch_shorts(requests, key, published_after, queries)
            for vid, video in shorts.items():
                if vid not in videos:
                    videos[vid] = video

        if not videos:
            return []

        # Statistics, 50 ids per call (1 unit each -- effectively free).
        ids = list(videos)
        for i in range(0, len(ids), 50):
            chunk = ids[i : i + 50]
            stats = requests.get(
                f"{API}/videos",
                # snippet costs nothing extra here and carries defaultAudioLanguage,
                # the only mechanical signal YouTube gives for content origin.
                params={"key": key, "id": ",".join(chunk), "part": "statistics,snippet"},
                timeout=30,
            )
            stats.raise_for_status()
            for item in stats.json().get("items", []):
                st = item.get("statistics", {})
                sn = item.get("snippet", {})
                videos[item["id"]].update(
                    view_count=int(st.get("viewCount", 0)),
                    like_count=int(st.get("likeCount", 0)),
                    comment_count=int(st.get("commentCount", 0)),
                    audio_language=sn.get("defaultAudioLanguage")
                    or sn.get("defaultLanguage"),
                )

        # Channel country gate -- the strongest mechanical origin signal
        # available, and far better than declared language.
        #
        # defaultAudioLanguage turned out to be self-reported and unreliable:
        # an Indian village-cooking channel with 12.9M views declares "en-US".
        # Channel country is set by the owner on the channel itself and is
        # accurate where present -- it correctly flags Village Cooking Channel
        # and Foodies findings as IN.
        #
        # It is unset on roughly 60% of channels, and unset passes through to
        # the extraction relevance gate rather than being dropped. Dropping on
        # missing metadata would discard most of the legitimate US content too.
        countries = self.config.get("allowed_channel_countries")
        if countries:
            self._apply_country_gate(requests, key, videos, countries)

        # Language gate. Weaker than the country gate above and kept only
        # because it does catch honestly-declared non-English audio (a live
        # pull dropped 299 videos on hi/ur/ta). It cannot be trusted on its
        # own -- see the en-US example above.
        allowed = self.config.get("allowed_audio_languages")
        if allowed:
            before = len(videos)
            videos = {
                vid: v for vid, v in videos.items()
                if _language_ok(v.get("audio_language"), allowed)
            }
            if before != len(videos):
                print(f"  [{self.name}] language gate dropped {before - len(videos)} videos")

        # Virality signals, computed against each channel's own baseline.
        vcfg = self.config.get("virality", {})
        if vcfg:
            counts = annotate_virality(videos, vcfg)
            print(
                f"  [{self.name}] virality: {counts.get('viral',0)} viral "
                f"({counts.get('breakout',0)} breakout, {counts.get('surging',0)} surging), "
                f"{counts.get('trend_marker',0)} trend-marked titles"
            )
            if vcfg.get("viral_only", False):
                before = len(videos)
                videos = {k: v for k, v in videos.items() if v.get("is_viral")}
                print(f"  [{self.name}] viral_only kept {len(videos)}/{before}")

        # Minimum-views floor, all videos. A 12-view upload is not evidence of
        # anything, and 75% of a relevance-ordered pull fell under 1,000.
        min_views = self.config.get("min_views", 0)
        if min_views:
            before = len(videos)
            videos = {
                vid: v for vid, v in videos.items()
                if v.get("view_count", 0) >= min_views
            }
            if before != len(videos):
                print(f"  [{self.name}] view floor dropped {before - len(videos)} videos")

        # Apply the Shorts engagement gate now that statistics are attached.
        # Long-form videos are never gated -- they already survived the
        # relevance-ordered search, and a low like rate there usually means a
        # small channel rather than bait.
        dropped = 0
        for vid in list(videos):
            if videos[vid].get("is_short") and not self._passes_engagement_gate(videos[vid]):
                del videos[vid]
                dropped += 1
        if shorts:
            print(f"  [{self.name}] shorts: {len(shorts)} found, {dropped} failed engagement gate")

        for vid, video in videos.items():
            video["top_comments"] = self._comments(requests, key, vid, comment_limit)

        return list(videos.values())

    def _search_into(
        self, videos: dict, requests, key: str, query: str, scope: str,
        order: str, published_after: str, per_query: int,
    ) -> bool:
        """Run one search and merge results into `videos`. False on failure.

        Isolated per query because search is a supplement that fails routinely:
        at 100 quota units a call it is the first thing to 429 once the daily
        budget runs down, and a failure must not discard the channel results
        already collected, which are the main path and cost almost nothing.
        """
        try:
            resp = requests.get(
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
                    "videoDuration": self.config.get("duration", "medium"),
                    "order": order,
                },
                timeout=30,
            )
            resp.raise_for_status()
        except Exception:  # noqa: BLE001 - quota exhaustion is routine here
            return False

        for item in resp.json().get("items", []):
            vid = item["id"]["videoId"]
            if vid in videos:
                continue  # already have it from a channel pull
            snippet = item["snippet"]
            videos[vid] = {
                "id": vid,
                "title": snippet["title"],
                "description": snippet.get("description", ""),
                "channel": snippet.get("channelTitle", ""),
                "channel_id": snippet.get("channelId", ""),
                "published_at": snippet["publishedAt"],
                "url": f"https://www.youtube.com/watch?v={vid}",
                "matched_query": query,
                "scope": scope,
            }
        return True

    def _fetch_shorts(self, requests, key, published_after, queries) -> dict[str, dict]:
        """Second pass for Shorts, gated on engagement rate rather than views.

        Shorts are where food trends break first, but also where engagement
        bait lives. Bait racks up views without earning likes or comments;
        genuine food content converts far better. Filtering on views selects
        for the bait, which is why the main pass excludes Shorts outright and
        this pass re-admits only the ones that clear a like and comment rate.
        """
        per_query = self.config.get("shorts_results_per_query", 15)
        found: dict[str, dict[str, Any]] = {}

        for query, scope in queries:
            resp = requests.get(
                f"{API}/search",
                params={
                    "key": key, "q": query, "part": "snippet", "type": "video",
                    "publishedAfter": published_after, "maxResults": per_query,
                    "relevanceLanguage": "en",
                    "regionCode": self.config.get("region_code", "US"),
                    "videoDuration": "short",
                    # viewCount is safe here only because the engagement gate
                    # below does the real filtering.
                    "order": "viewCount",
                },
                timeout=30,
            )
            if resp.status_code != 200:
                continue
            for item in resp.json().get("items", []):
                vid = item["id"]["videoId"]
                snippet = item["snippet"]
                found[vid] = {
                    "id": vid,
                    "title": snippet["title"],
                    "description": snippet.get("description", ""),
                    "channel": snippet.get("channelTitle", ""),
                    "published_at": snippet["publishedAt"],
                    "url": f"https://www.youtube.com/watch?v={vid}",
                    "matched_query": query,
                    "channel_id": snippet.get("channelId", ""),
                    "scope": _narrowest(scope, found.get(vid, {}).get("scope")),
                    "is_short": True,
                }
        return found

    def _apply_country_gate(self, requests, key, videos: dict, allowed: list[str]) -> None:
        """Drop videos whose channel declares a country outside `allowed`.

        Mutates `videos` in place. One channels.list call per 50 channels at
        1 quota unit each -- effectively free. Channels with no declared
        country are kept and left for the extraction relevance gate.
        """
        chan_ids = {v.get("channel_id") for v in videos.values() if v.get("channel_id")}
        if not chan_ids:
            return

        country_of: dict[str, str | None] = {}
        ids = list(chan_ids)
        for i in range(0, len(ids), 50):
            resp = requests.get(
                f"{API}/channels",
                params={"key": key, "id": ",".join(ids[i : i + 50]), "part": "snippet"},
                timeout=30,
            )
            if resp.status_code != 200:
                return  # gate is best-effort; never fail a run over it
            for item in resp.json().get("items", []):
                country_of[item["id"]] = item["snippet"].get("country")

        allowed_set = {c.upper() for c in allowed}
        dropped = [
            vid for vid, v in videos.items()
            if (c := country_of.get(v.get("channel_id"))) and c.upper() not in allowed_set
        ]
        for vid in dropped:
            del videos[vid]
        if dropped:
            known = sum(1 for c in country_of.values() if c)
            print(
                f"  [{self.name}] country gate dropped {len(dropped)} videos "
                f"({known}/{len(country_of)} channels declare a country)"
            )

    def _passes_engagement_gate(self, video: dict[str, Any]) -> bool:
        views = video.get("view_count", 0)
        if not views:
            return False
        likes = video.get("like_count", 0)
        comments = video.get("comment_count", 0)
        return (
            likes / views >= self.config.get("shorts_min_like_rate", 0.03)
            and comments >= self.config.get("shorts_min_comments", 25)
        )

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
                    media_type="short" if r.get("is_short") else "video",
                    location=r.get("channel"),
                    scope=r.get("scope") or "national",
                    breakout_ratio=r.get("breakout_ratio"),
                    is_viral=bool(r.get("is_viral")),
                    trend_marker=bool(r.get("trend_marker")),
                )
            )
        return posts
