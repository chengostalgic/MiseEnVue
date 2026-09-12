"""Reddit connector.

parse() is complete and works against the payload shape committed in
data/fixtures/reddit.json, so the pipeline runs end to end today via the
fixture fallback in Connector.fetch().

fetch_raw() is task #3 -- wire up PRAW and this goes live with no other change.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ingestion.connectors.base import Connector
from ingestion.schema import Post


class RedditConnector(Connector):
    name = "reddit"

    def fetch_raw(self, since_days: int) -> list[dict[str, Any]]:
        raise NotImplementedError(
            "Reddit live fetch not implemented yet (task #3). "
            "Using cached/fixture data."
        )

    def parse(self, raw: list[dict[str, Any]]) -> list[Post]:
        posts = []
        for r in raw:
            # Title and body both carry dish mentions; extraction reads the pair.
            text = " ".join(filter(None, [r.get("title"), r.get("selftext")])).strip()
            if not text:
                continue
            posts.append(
                Post(
                    source=self.name,
                    id=r["id"],
                    url=r.get("permalink") or r.get("url", ""),
                    text=text,
                    created_at=datetime.fromtimestamp(
                        r["created_utc"], tz=timezone.utc
                    ),
                    # Comments weight as much as upvotes here: an argument in the
                    # replies is a stronger trend signal than a silent upvote.
                    engagement=r.get("score", 0) + r.get("num_comments", 0),
                    media_type=r.get("post_hint"),
                    location=r.get("subreddit"),
                )
            )
        return posts
