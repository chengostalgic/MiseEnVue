"""Cross-source normalization.

Connectors return Posts with source-native engagement numbers. A YouTube view
count of 4000 and a TikTok like count of 4000 mean completely different things,
so scoring never touches the raw number -- it uses the percentile within that
source's own pull, which is comparable.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ingestion.schema import Post


def normalize(posts: list[Post]) -> list[Post]:
    """Attach engagement_pct, grouped by source."""
    by_source: dict[str, list[Post]] = {}
    for p in posts:
        by_source.setdefault(p.source, []).append(p)

    for source_posts in by_source.values():
        ranked = sorted(source_posts, key=lambda p: p.engagement or 0)
        n = len(ranked)
        for i, post in enumerate(ranked):
            # Single-post sources get 1.0 rather than a divide-by-zero.
            post.engagement_pct = (i + 1) / n if n > 1 else 1.0

    return posts


def within_window(posts: list[Post], since_days: int) -> list[Post]:
    """Drop anything older than the window.

    Connectors are asked for a window but not all of them honor it precisely,
    so this is enforced here rather than trusted upstream.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=since_days)
    return [p for p in posts if p.created_at >= cutoff]


def dedupe(posts: list[Post]) -> list[Post]:
    """Drop repeats of the same (source, id).

    Overlapping search queries return the same video more than once, and an
    uncounted duplicate inflates mention_count -- the one number an owner is
    most likely to check.
    """
    seen: set[tuple[str, str]] = set()
    out = []
    for p in posts:
        key = (p.source, p.id)
        if key not in seen:
            seen.add(key)
            out.append(p)
    return out
