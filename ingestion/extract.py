"""Dish extraction and clustering.

>>> PLACEHOLDER. This is task #5 and it is the centerpiece of the demo. <<<

What ships here now is deliberate throwaway: keyword matching against a seed
list in config.yaml, plus a word-list sentiment guess. It exists only so the
pipeline runs end to end and the seams downstream are exercised. It cannot
discover a dish nobody listed, and it does not really understand sentiment.

The real version batches posts through an LLM that:
  1. extracts dish mentions, enforcing the dish-level constraint (no bare
     ingredients or techniques -- see docs/PLAN.md),
  2. clusters surface forms by receiving the dish list found so far and
     matching-or-creating, which is why there is no embedding store here,
  3. writes why_trending grounded in the posts actually collected,
  4. labels sentiment from post.comments -- not post.text, which on YouTube is
     the creator's own marketing copy -- and names the negative theme.

Keep the DishCluster shape when replacing this; score.py depends on it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ingestion.schema import Post, WhyTrending

# Placeholder sentiment cues. The real pass asks the model per post.
_POSITIVE = {
    "love", "best", "incredible", "amazing", "delicious", "great", "obsessed",
    "so good", "favorite", "perfect",
}
_NEGATIVE = {
    "tired", "overrated", "hate", "bad", "worst", "disappointing", "gross",
    "mistake", "not worth", "overpriced",
}


@dataclass
class DishCluster:
    """One dish and every post that mentions it, pre-scoring."""

    id: str
    name: str
    aliases: list[str] = field(default_factory=list)
    cuisine_tags: list[str] = field(default_factory=list)
    posts: list[Post] = field(default_factory=list)
    sentiments: dict[str, str] = field(default_factory=dict)  # post id -> label
    why_trending: WhyTrending = field(
        default_factory=lambda: WhyTrending(summary="")
    )
    negative_theme: str = ""


def extract(posts: list[Post], config: dict[str, Any]) -> list[DishCluster]:
    """Group posts into dish clusters. Replace wholesale in task #5."""
    seeds = config.get("placeholder_dishes", [])
    clusters: dict[str, DishCluster] = {}

    for seed in seeds:
        clusters[seed["id"]] = DishCluster(
            id=seed["id"],
            name=seed["name"],
            aliases=seed.get("aliases", []),
            cuisine_tags=seed.get("cuisine_tags", []),
            why_trending=WhyTrending(
                summary=f"[placeholder] Matched on keyword for {seed['name']}.",
                drivers=["Replace with real extraction (task #5)"],
                audience="unknown",
            ),
        )

    for post in posts:
        lowered = post.text.lower()
        for seed in seeds:
            terms = [seed["name"].lower(), *(a.lower() for a in seed.get("aliases", []))]
            if any(term in lowered for term in terms):
                cluster = clusters[seed["id"]]
                cluster.posts.append(post)
                # Dish identity comes from the title, sentiment from the
                # comments. A creator never captions their own video negatively,
                # so reading post.text for sentiment would return ~100% positive
                # on every dish.
                cluster.sentiments[post.id] = _guess_sentiment(
                    " ".join(post.comments).lower() if post.comments else lowered
                )
                break  # one dish per post keeps mention_count honest

    return [c for c in clusters.values() if c.posts]


def _guess_sentiment(text: str) -> str:
    pos = sum(w in text for w in _POSITIVE)
    neg = sum(w in text for w in _NEGATIVE)
    if pos > neg:
        return "positive"
    if neg > pos:
        return "negative"
    return "neutral"
