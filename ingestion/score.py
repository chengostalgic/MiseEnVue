"""Scoring and final Dish assembly.

trend_score combines four components, weighted from config.yaml:

  volume    how many posts mention the dish, relative to the top dish
  velocity  search trajectory from Google Trends -- the only component that
            knows whether a trend is arriving or leaving
  breadth   how many distinct (source, scope) pairs it appears in
  recency   exponential decay on post age

Each component is normalized to 0-1 before weighting, so the weights mean what
they look like they mean. Components that cannot be computed (no Trends data,
say) are dropped and the remaining weights are renormalized, rather than
scoring the dish as zero on that axis -- a missing signal is not a bad signal.

Metrics are counted mechanically here rather than asked of the model. When the
generated why_trending and these numbers disagree, the numbers are right.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from ingestion.extract import DishCluster
from ingestion.schema import Dish, Evidence, Metrics
from ingestion.trends import Velocity

MAX_EVIDENCE = 6


def score_all(
    clusters: list[DishCluster],
    window_days: int,
    config: dict[str, Any],
    velocities: dict[str, Velocity] | None = None,
) -> list[Dish]:
    """Score every cluster and return dishes ranked high to low."""
    if not clusters:
        return []

    velocities = velocities or {}
    scoring = config.get("scoring", {})
    weights = scoring.get("weights", {})
    top_n = config.get("output", {}).get("max_dishes", 20)

    peak_volume = max(len(c.posts) for c in clusters)
    peak_breadth = max(len(_source_scopes(c)) for c in clusters) or 1

    dishes = [
        _to_dish(c, window_days, peak_volume, peak_breadth, weights, scoring,
                 velocities.get(c.name))
        for c in clusters
    ]
    dishes.sort(key=lambda d: d.trend_score, reverse=True)
    return dishes[:top_n]


def _to_dish(
    cluster: DishCluster,
    window_days: int,
    peak_volume: int,
    peak_breadth: int,
    weights: dict,
    scoring: dict,
    velocity: Velocity | None,
) -> Dish:
    posts = cluster.posts

    components: dict[str, float] = {
        "volume": len(posts) / peak_volume if peak_volume else 0.0,
        "breadth": len(_source_scopes(cluster)) / peak_breadth,
        "recency": _recency(posts, scoring.get("recency_halflife_days", 3)),
    }
    if velocity is not None and velocity.computable:
        components["velocity"] = _velocity_component(velocity)

    # Renormalize over the components we actually have, so a dish missing
    # Trends data is not silently penalized against one that has it.
    live = {k: w for k, w in weights.items() if k in components}
    total_weight = sum(live.values()) or 1.0
    score = sum(components[k] * w for k, w in live.items()) / total_weight

    return Dish(
        id=cluster.id,
        name=cluster.name,
        aliases=cluster.aliases,
        cuisine_tags=cluster.cuisine_tags,
        trend_score=round(100.0 * score, 1),
        momentum=velocity.momentum if velocity else "steady",
        metrics=_metrics(cluster, window_days, velocity),
        why_trending=cluster.why_trending,
        evidence=_pick_evidence(cluster, velocity),
    )


def _velocity_component(v: Velocity) -> float:
    """Map percent change onto 0-1.

    Clamped at +/-100%: a term going from near-zero to any interest can post a
    four-figure percentage, and without a clamp one such dish would flatten
    every other velocity score to nothing.
    """
    pct = {
        "local": v.local_pct,
        "regional": v.regional_pct,
        "national": v.national_pct,
    }.get(v.momentum_basis)
    if pct is None:
        return 0.5
    component = max(0.0, min(1.0, (max(-100.0, min(100.0, pct)) + 100.0) / 200.0))
    if v.low_confidence:
        # Rose from a zero baseline: real but thinly evidenced. Pull it halfway
        # back to neutral so it can still help a dish without letting a term
        # nobody was searching for beat one with genuine momentum.
        component = 0.5 + (component - 0.5) * 0.5
    return component


def _recency(posts: list, halflife_days: float) -> float:
    """Mean exponential decay over post age."""
    if not posts:
        return 0.0
    now = datetime.now(timezone.utc)
    decays = [
        0.5 ** (max(0.0, (now - p.created_at).total_seconds() / 86400) / halflife_days)
        for p in posts
    ]
    return sum(decays) / len(decays)


def _source_scopes(cluster: DishCluster) -> set[tuple[str, str]]:
    """Distinct (source, scope) pairs. National YouTube and local YouTube count
    separately -- a dish appearing in both is broader evidence than one that
    only shows up nationally."""
    return {(p.source, p.scope) for p in cluster.posts}


def _metrics(
    cluster: DishCluster, window_days: int, velocity: Velocity | None
) -> Metrics:
    posts = cluster.posts
    counts = {"positive": 0, "negative": 0, "neutral": 0}
    for label in cluster.sentiments.values():
        counts[label] = counts.get(label, 0) + 1
    total = sum(counts.values()) or 1

    by_source: dict[str, int] = {}
    for p in posts:
        by_source[p.source] = by_source.get(p.source, 0) + 1
    if velocity is not None and velocity.computable:
        by_source["google_trends"] = 1

    return Metrics(
        window_days=window_days,
        mention_count=len(posts),
        by_source=by_source,
        total_engagement=sum(p.engagement or 0 for p in posts),
        sentiment={k: round(v / total, 2) for k, v in counts.items()},
        negative_theme=cluster.negative_theme,
        local_mention_count=sum(1 for p in posts if p.scope == "local"),
    )


def _pick_evidence(cluster: DishCluster, velocity: Velocity | None) -> list[Evidence]:
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

    evidence = [
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

    if velocity is not None and velocity.computable:
        evidence.append(_trend_evidence(cluster.name, velocity))
    return evidence


def _trend_evidence(name: str, v: Velocity) -> Evidence:
    parts = []
    if v.local_pct is not None:
        parts.append(f"metro {v.local_pct:+.0f}%")
    if v.regional_pct is not None:
        parts.append(f"state {v.regional_pct:+.0f}%")
    if v.national_pct is not None:
        parts.append(f"national {v.national_pct:+.0f}%")
    excerpt = f"Search interest for '{name}': " + ", ".join(parts) + " vs prior window."
    excerpt += f" Momentum read at {v.momentum_basis} level."
    if v.local_rising_queries:
        excerpt += " Rising locally: " + ", ".join(v.local_rising_queries) + "."
    return Evidence(
        source="google_trends",
        url=f"https://trends.google.com/trends/explore?q={name.replace(' ', '%20')}",
        excerpt=excerpt,
        engagement=None,
        sentiment="neutral",
        observed_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )
