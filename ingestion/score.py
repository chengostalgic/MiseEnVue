"""Scoring and final Dish assembly.

Volume-only for now (task #4 territory); velocity, cross-source breadth, and
recency decay arrive with Google Trends in task #6. Weights live in
config.yaml so they can be tuned during the demo without editing Python.

Metrics are counted mechanically here rather than asked of the model. When the
generated why_trending and these numbers disagree, the numbers are right.
"""

from __future__ import annotations

from typing import Any

from ingestion.extract import DishCluster
from ingestion.schema import Dish, Evidence, Metrics

MAX_EVIDENCE = 6


def score_all(
    clusters: list[DishCluster], window_days: int, config: dict[str, Any]
) -> list[Dish]:
    """Score every cluster and return dishes ranked high to low."""
    if not clusters:
        return []

    top_n = config.get("output", {}).get("max_dishes", 20)
    peak = max(len(c.posts) for c in clusters)

    dishes = [_to_dish(c, window_days, peak) for c in clusters]
    dishes.sort(key=lambda d: d.trend_score, reverse=True)
    return dishes[:top_n]


def _to_dish(cluster: DishCluster, window_days: int, peak: int) -> Dish:
    posts = cluster.posts
    counts = {"positive": 0, "negative": 0, "neutral": 0}
    for label in cluster.sentiments.values():
        counts[label] = counts.get(label, 0) + 1
    total = sum(counts.values()) or 1

    by_source: dict[str, int] = {}
    for p in posts:
        by_source[p.source] = by_source.get(p.source, 0) + 1

    metrics = Metrics(
        window_days=window_days,
        mention_count=len(posts),
        by_source=by_source,
        total_engagement=sum(p.engagement or 0 for p in posts),
        sentiment={k: round(v / total, 2) for k, v in counts.items()},
        negative_theme=cluster.negative_theme,
    )

    return Dish(
        id=cluster.id,
        name=cluster.name,
        aliases=cluster.aliases,
        cuisine_tags=cluster.cuisine_tags,
        # Volume relative to the top dish, scaled to 0-100. Crude on purpose --
        # the real formula lands in task #6.
        trend_score=100.0 * len(posts) / peak if peak else 0.0,
        momentum="steady",  # needs velocity, which needs Google Trends (task #6)
        metrics=metrics,
        why_trending=cluster.why_trending,
        evidence=_pick_evidence(cluster),
    )


def _pick_evidence(cluster: DishCluster) -> list[Evidence]:
    """Highest-engagement posts, but never an all-positive highlight reel.

    If the dish has negative mentions, at least one is kept. The sentiment
    percentages have to be auditable against the evidence shown, otherwise the
    owner is being sold rather than informed.
    """
    ranked = sorted(cluster.posts, key=lambda p: p.engagement or 0, reverse=True)
    picked = ranked[:MAX_EVIDENCE]

    negatives = [p for p in ranked if cluster.sentiments.get(p.id) == "negative"]
    if negatives and not any(cluster.sentiments.get(p.id) == "negative" for p in picked):
        picked = picked[: MAX_EVIDENCE - 1] + [negatives[0]]

    return [
        Evidence(
            source=p.source,
            url=p.url,
            excerpt=p.text[:200].strip(),
            engagement=p.engagement,
            sentiment=cluster.sentiments.get(p.id, "neutral"),
            observed_at=p.created_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        for p in picked
    ]
