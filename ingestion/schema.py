"""Shared data shapes for the ingestion pipeline.

Two schemas live here:

  Post  - the normalized internal record every connector maps into. Private to
          Part 1; nothing downstream sees it.
  Dish  - the public output record. This is the Part 1 -> Part 2 contract, so
          changing it means telling the rest of the team.

See docs/PLAN.md for the contract rationale and data/out/trends.json for a
worked example.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Any, Literal

Sentiment = Literal["positive", "negative", "neutral"]
Momentum = Literal["rising", "steady", "fading"]

SCHEMA_VERSION = 1


# --------------------------------------------------------------------------
# Internal
# --------------------------------------------------------------------------


@dataclass
class Post:
    """One post from one source, after normalization.

    `engagement` is the raw source-native number (views, upvotes) and is not
    comparable across sources. `engagement_pct` is its percentile within its
    own source's pull, which is. Scoring uses the percentile.

    `text` and `comments` carry different signals and extraction reads them
    differently. On YouTube `text` is the title and description -- creator
    marketing copy, good for identifying the dish, useless for sentiment.
    `comments` is the audience talking back, which is where sentiment and
    negative_theme actually come from.
    """

    source: str
    id: str
    url: str
    text: str
    created_at: datetime
    engagement: int | None = None
    comments: list[str] = field(default_factory=list)
    media_type: str | None = None
    location: str | None = None
    engagement_pct: float | None = None
    # "national" = broad category search, catches emerging dishes early.
    # "local" = tied to the client's city, reflects what this market wants.
    # A dish appearing in both is the strongest signal in the pipeline.
    scope: Literal["national", "local"] = "national"


# --------------------------------------------------------------------------
# Output contract
# --------------------------------------------------------------------------


@dataclass
class Evidence:
    source: str
    url: str
    excerpt: str
    observed_at: str
    engagement: int | None = None
    sentiment: Sentiment = "neutral"


@dataclass
class Metrics:
    window_days: int
    mention_count: int
    by_source: dict[str, int]
    total_engagement: int
    sentiment: dict[str, float]
    negative_theme: str = ""
    # How much of the conversation is in the client's own market. A dish
    # trending nationally with zero local mentions is either an early opening
    # or a poor fit for local taste, and the owner is far better placed to
    # judge which than the pipeline is -- so surface the number, don't bury it
    # in the score.
    local_mention_count: int = 0


@dataclass
class WhyTrending:
    summary: str
    drivers: list[str] = field(default_factory=list)
    audience: str = ""


@dataclass
class Dish:
    id: str
    name: str
    trend_score: float
    momentum: Momentum
    metrics: Metrics
    why_trending: WhyTrending
    aliases: list[str] = field(default_factory=list)
    cuisine_tags: list[str] = field(default_factory=list)
    evidence: list[Evidence] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        # Key order here matches data/out/trends.json so diffs stay readable.
        return {
            "id": self.id,
            "name": self.name,
            "aliases": self.aliases,
            "cuisine_tags": self.cuisine_tags,
            "trend_score": round(self.trend_score, 1),
            "momentum": self.momentum,
            "metrics": asdict(self.metrics),
            "why_trending": asdict(self.why_trending),
            "evidence": [asdict(e) for e in self.evidence],
        }


def build_output(
    dishes: list[Dish],
    window_days: int,
    window_start: datetime,
    window_end: datetime,
    sources_used: list[str],
    fixture: bool = False,
) -> dict[str, Any]:
    """Assemble the full trends.json envelope."""
    out: dict[str, Any] = {}
    if fixture:
        out["_meta"] = {
            "fixture": True,
            "note": "Generated from committed fixtures, not a live pull.",
            "schema_version": SCHEMA_VERSION,
        }
    else:
        out["_meta"] = {"fixture": False, "schema_version": SCHEMA_VERSION}

    out["generated_at"] = _iso(datetime.now().astimezone())
    out["window"] = {
        "days": window_days,
        "start": _iso(window_start),
        "end": _iso(window_end),
    }
    out["sources_used"] = sources_used
    out["dishes"] = [d.to_dict() for d in dishes]
    return out


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
