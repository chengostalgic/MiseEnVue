"""Scoring and final Dish assembly.

trend_score combines four components, weighted from config.yaml:

  virality  how much of the dish's coverage actually broke out -- mean
            breakout ratio against channel baselines, plus whether creators
            framed it as trend coverage. This is what separates a trend from
            a recipe two channels happened to post in the same fortnight.
  reach     audience that actually evidence the dish -- log-scaled views,
            downweighted for celebrity interviews and ordinary big-channel
            uploads so a 4M-view talk-show mention cannot beat a real breakout.
  volume    distinct creators, not raw posts. Two cuts of the same Food
            Network segment are one voice.
  local     share of local-scope posts, only when the run found any.
  velocity  audience trajectory. Derived from the dish's own videos --
            breakout against channel baselines and views/day -- with Google
            Trends used only as optional enrichment when it is reachable.
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
from typing import TYPE_CHECKING, Any

from ingestion.schema import Dish, Evidence, Metrics
from ingestion.trends import Velocity

if TYPE_CHECKING:
    from ingestion.extract import DishCluster

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
    out_cfg = config.get("output", {})
    top_n = out_cfg.get("max_dishes", 20)

    # Drop singletons before scoring. A dish with one mention has no evidence
    # of independent repetition, which is the whole definition of a trend --
    # and because volume is identical across singletons, their relative order
    # is decided by rounding noise in recency rather than by anything real.
    floor = out_cfg.get("min_mentions", 2)
    eligible = [c for c in clusters if len(c.posts) >= floor]
    if not eligible:
        # Everything is a singleton -- better to show a weak list than none,
        # but say so rather than silently returning an empty file.
        print(f"  [score] no dish reached {floor} mentions; showing singletons")
        eligible = clusters
    elif len(eligible) < len(clusters):
        print(f"  [score] {len(clusters) - len(eligible)} single-mention dishes dropped")
    clusters = eligible

    peak_volume = max(len(_creators(c.posts)) for c in clusters) or 1
    peak_breadth = max(len(_source_scopes(c)) for c in clusters) or 1
    peak_reach = max(_effective_views(c.posts) for c in clusters) or 1
    peak_views_per_day = max(
        (max((p.views_per_day or 0) for p in c.posts) for c in clusters), default=0
    ) or 1
    peak_local = max(_local_mentions(c.posts) for c in clusters)
    peak_restaurants = max((_local_restaurants(c.posts) for c in clusters), default=0)

    dishes = [
        _to_dish(
            c, window_days, peak_volume, peak_breadth, peak_reach,
            peak_views_per_day, peak_local, peak_restaurants, weights, scoring,
            velocities.get(c.name),
        )
        for c in clusters
    ]
    dishes.sort(key=lambda d: d.trend_score, reverse=True)
    return dishes[:top_n]


def _to_dish(
    cluster: DishCluster,
    window_days: int,
    peak_volume: int,
    peak_breadth: int,
    peak_reach: int,
    peak_views_per_day: int,
    peak_local: int,
    peak_restaurants: int,
    weights: dict,
    scoring: dict,
    velocity: Velocity | None,
) -> Dish:
    posts = cluster.posts

    components: dict[str, float] = {
        "reach": _reach(posts, peak_reach),
        "volume": len(_creators(posts)) / peak_volume if peak_volume else 0.0,
        "breadth": len(_source_scopes(cluster)) / peak_breadth,
        "recency": _recency(posts, scoring.get("recency_halflife_days", 3)),
    }
    # Maps-only clusters have no breakout ratio. Treating that as virality=0
    # would bury the county signal under YouTube's weight. Missing is not bad.
    if any(p.source == "youtube" and p.breakout_ratio is not None for p in posts):
        components["virality"] = _virality(posts)
    if peak_local > 0:
        # Only score local presence when the run actually found local posts.
        # Otherwise every dish would be 0 and the weight would just flatten
        # the other components after renormalization.
        components["local"] = _local_mentions(posts) / peak_local
    if peak_restaurants > 0:
        components["local_spike"] = _local_restaurants(posts) / peak_restaurants
    if velocity is not None and velocity.computable:
        components["velocity"] = _velocity_component(velocity)
    else:
        # Fall back to the dish's own audience trajectory. Same quantity Trends
        # was approximating, measured on data we already hold.
        own = _own_velocity(cluster, peak_views_per_day)
        if own is not None:
            components["velocity"] = own

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
        momentum=_momentum(cluster, velocity, scoring),
        metrics=_metrics(cluster, window_days, velocity),
        why_trending=cluster.why_trending,
        evidence=_pick_evidence(cluster, velocity),
    )


def _momentum(cluster: DishCluster, velocity: Velocity | None, scoring: dict) -> str:
    """Is this dish arriving or leaving?

    Derived from the dish's own videos rather than Google Trends. Trends is
    rate-limited per IP (roughly 8-10 sessions an hour) and was blocking
    outright during development, so depending on it for a headline field made
    the demo hostage to an endpoint we do not control.

    The video data measures the same thing more directly anyway: breakout ratio
    is a video's views against its channel's own median, so a dish whose videos
    consistently outperform their channels is one the audience is seeking out
    rather than one that rode a big subscriber base. Google search volume was
    always a proxy for that.

    A reachable Trends reading still wins when it exists -- it is independent
    evidence, and independent evidence beats inference.
    """
    if velocity is not None and velocity.computable:
        return velocity.momentum

    ratios = [p.breakout_ratio for p in cluster.posts if p.breakout_ratio is not None]
    restaurants = _local_restaurants(cluster.posts)
    if restaurants >= scoring.get("rising_local_restaurants", 4) and not ratios:
        return "rising"

    if not ratios:
        return "steady"

    mean_ratio = sum(ratios) / len(ratios)
    if mean_ratio >= scoring.get("rising_breakout", 1.8):
        return "rising"
    if mean_ratio <= scoring.get("fading_breakout", 0.7):
        return "fading"
    return "steady"


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


def _own_velocity(cluster: DishCluster, peak_per_day: int) -> float | None:
    """Velocity from the dish's own videos, normalized 0-1.

    Peak views/day across the dish's videos, scaled against the fastest-moving
    dish in the run. A dish whose best video is pulling 200k views/day is
    surging regardless of what Google search says.
    """
    rates = [p.views_per_day or 0 for p in cluster.posts]
    if not any(rates):
        return None
    return min(1.0, max(rates) / peak_per_day)


def _total_views(posts: list) -> int:
    return sum(p.engagement or 0 for p in posts)


def _effective_views(posts: list) -> int:
    """Views that count as evidence the *dish* is trending.

    Celebrity interviews and ordinary uploads on huge channels produce raw
    view counts that drown real breakouts. Those views still count, but at
    a fraction, so a 4M-view 'Sam Smith loves Hooters' feature cannot beat
    a 200k-view dish that actually broke out.
    """
    total = 0.0
    for post in posts:
        views = float(post.engagement or 0)
        if post.is_evergreen:
            views *= 0.1
        elif (
            post.breakout_ratio is not None
            and post.breakout_ratio < 1.2
            and not post.trend_marker
            and not post.is_viral
        ):
            views *= 0.35
        total += views
    return int(total)


def _creators(posts: list) -> set[str]:
    """Distinct channels. Two cuts of the same Food Network segment are one voice."""
    return {(p.location or p.id) for p in posts}


def _local_mentions(posts: list) -> int:
    return sum(1 for p in posts if p.scope == "local")


def _local_restaurants(posts: list) -> int:
    """Distinct Maps restaurants (or other local places) naming the dish."""
    return len({
        p.location
        for p in posts
        if p.location and (p.source == "google_maps" or p.scope == "local" and p.source != "youtube")
    })


def _virality(posts: list) -> float:
    """How much of this dish's coverage genuinely broke out, 0-1.

    Two parts, because they answer different questions. Breakout ratio says
    the AUDIENCE responded beyond what the channel normally draws. Trend
    markers say the CREATOR was covering a trend rather than posting a recipe.
    A dish with both is the Dubai-chocolate shape; a dish with neither is two
    channels coincidentally posting risotto.

    Breakout is capped at 4x before scaling -- one runaway video should lift a
    dish clearly without letting a single outlier saturate the component.
    """
    useful = [p for p in posts if not p.is_evergreen]
    if not useful:
        return 0.0

    ratios = [p.breakout_ratio for p in useful if p.breakout_ratio is not None]
    breakout = (
        min(1.0, (sum(ratios) / len(ratios)) / 4.0) if ratios else 0.0
    )
    marked = sum(1 for p in useful if p.trend_marker) / len(useful)
    return 0.65 * breakout + 0.35 * marked


def _reach(posts: list, peak_reach: int) -> float:
    """Total audience, log-scaled against the top dish.

    Log rather than linear because view counts span five orders of magnitude
    in a single pull (median 124, max 937k). Linear scaling would give every
    dish but the single biggest a reach near zero, collapsing the component
    into a one-hot vector. Log keeps the ordering while leaving the rest of
    the field distinguishable.
    """
    total = _effective_views(posts)
    if total <= 0 or peak_reach <= 0:
        return 0.0
    return min(1.0, math.log10(1 + total) / math.log10(1 + peak_reach))


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
        local_mention_count=_local_mentions(posts),
        local_restaurant_count=_local_restaurants(posts),
        creator_count=len(_creators(posts)),
        sentiment={k: round(v / total, 2) for k, v in counts.items()},
        negative_theme=cluster.negative_theme,
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
