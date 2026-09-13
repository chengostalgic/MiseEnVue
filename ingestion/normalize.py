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
    """Attach engagement_pct, grouped by (source, scope).

    Scope matters as much as source here. Local restaurant reviews pull view
    counts in the tens or hundreds; national recipe videos pull hundreds of
    thousands. Ranking them in one pool puts every local video in the bottom
    percentile and silently deletes the local signal -- the exact signal a
    restaurant owner cares most about. A 900-view Houston review is a strong
    local result and should score like one.
    """
    groups: dict[tuple[str, str], list[Post]] = {}
    for p in posts:
        groups.setdefault((p.source, p.scope), []).append(p)

    for group in groups.values():
        ranked = sorted(group, key=lambda p: p.engagement or 0)
        n = len(ranked)
        for i, post in enumerate(ranked):
            # Single-post groups get 1.0 rather than a divide-by-zero.
            post.engagement_pct = (i + 1) / n if n > 1 else 1.0

    return posts


def within_window(posts: list[Post], since_days: int) -> list[Post]:
    """Drop anything older than the window.

    Connectors are asked for a window but not all of them honor it precisely,
    so this is enforced here rather than trusted upstream.

    Callers must pass the WIDEST window any connector was asked for, not the
    --since value. Channel pulls deliberately reach further back, and filtering
    to --since here silently discards them.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=since_days)
    return [p for p in posts if p.created_at >= cutoff]


def select_for_extract(posts: list[Post], cfg: dict) -> list[Post]:
    """Cap how many posts reach the model without deleting the local tier.

    National YouTube views dwarf a Maps review. A global top-N by engagement
    would drop every county signal the moment the corpus exceeds max_posts.
    Scope and source floors reserve slots first; leftover room is filled by
    engagement percentile.
    """
    cap = cfg.get("max_posts", 300)
    if len(posts) <= cap:
        return posts

    reserved: list[Post] = []
    taken: set[int] = set()

    source_floors = cfg.get("source_floors") or {}
    for source, floor in source_floors.items():
        scoped = [p for p in posts if p.source == source]
        keep = sorted(scoped, key=lambda p: p.engagement_pct or 0, reverse=True)[: int(floor)]
        for post in keep:
            reserved.append(post)
            taken.add(id(post))

    scope_floors = cfg.get("scope_floors") or {}
    for scope, floor in scope_floors.items():
        scoped = [p for p in posts if p.scope == scope and id(p) not in taken]
        keep = sorted(scoped, key=lambda p: p.engagement_pct or 0, reverse=True)[: int(floor)]
        for post in keep:
            reserved.append(post)
            taken.add(id(post))

    leftover = cap - len(reserved)
    rest = [p for p in posts if id(p) not in taken]
    rest = sorted(rest, key=lambda p: p.engagement_pct or 0, reverse=True)[: max(0, leftover)]
    selected = reserved + rest
    print(
        f"  [extract] {len(posts)} posts -> {len(selected)} sampled "
        f"({sum(1 for p in selected if p.scope == 'local')} local reserved)"
    )
    return selected


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
