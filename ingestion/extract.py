"""Dish extraction and clustering via Claude.

This is the step that turns a pile of video titles into a ranked list of dishes
with reasons attached. Two passes:

  1. CLUSTER   batches of posts -> dish assignments. Each batch receives the
               dish list found so far and either matches an existing dish or
               coins a new one. That running list is why there is no embedding
               store here: the model does the matching, and a prompt is faster
               to iterate on than a tuned similarity threshold.

  2. SYNTHESIZE  per dish -> why_trending, grounded only in that dish's own
               posts and comments.

Two rules the prompts enforce, both load-bearing:

  * The unit of output is a DISH. Ingredient trends ("chili crisp is
    everywhere"), technique trends, and format trends are real signals but are
    not menu items -- nobody drives foot traffic with Lao Gan Ma. They get
    recorded as a driver of the dish that carries them, or dropped.

  * Sentiment comes from COMMENTS, never from titles or descriptions. A creator
    never captions their own video negatively, so reading post.text for
    sentiment would return ~100% positive on every dish and leave
    negative_theme permanently empty.

Structured outputs (output_format=) are used rather than asking for JSON in
prose: the schema is enforced server-side, so a malformed response is not a
failure mode that has to be handled at 2am.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import BaseModel, Field

from ingestion.schema import Post, WhyTrending

MODEL = "claude-opus-5"


# --------------------------------------------------------------------------
# Output schemas
# --------------------------------------------------------------------------


class Assignment(BaseModel):
    """One post assigned to one dish."""

    post_id: str
    dish_id: str = Field(description="kebab-case slug; reuse an existing one if it matches")
    dish_name: str = Field(description="how it would read on a menu")
    aliases: list[str] = Field(default_factory=list)
    cuisine_tags: list[str] = Field(default_factory=list)
    sentiment: Literal["positive", "negative", "neutral"]


class Batch(BaseModel):
    assignments: list[Assignment]


class Reasoning(BaseModel):
    summary: str = Field(description="2-3 sentences on why this is trending")
    drivers: list[str] = Field(description="3-4 short phrases")
    audience: str = Field(description="age band + dining occasion")
    negative_theme: str = Field(description="what critics say; empty string if nobody complained")


@dataclass
class DishCluster:
    """One dish and every post that mentions it, pre-scoring."""

    id: str
    name: str
    aliases: list[str] = field(default_factory=list)
    cuisine_tags: list[str] = field(default_factory=list)
    posts: list[Post] = field(default_factory=list)
    sentiments: dict[str, str] = field(default_factory=dict)  # post id -> label
    why_trending: WhyTrending = field(default_factory=lambda: WhyTrending(summary=""))
    negative_theme: str = ""


# --------------------------------------------------------------------------
# Prompts
# --------------------------------------------------------------------------

CLUSTER_SYSTEM = """\
You identify trending restaurant dishes from food video data.

For each post you are given a title, a description, and viewer comments. Decide \
whether it is about a specific, nameable DISH. If it is, assign it.

WHAT COUNTS AS A DISH
A dish is something an owner could put on a menu and a campaign could be built \
around. "Chili crisp hot honey wings" is a dish. "Chili crisp" is an ingredient. \
"Air fryer" is a technique. "Girl dinner" is a format.

Ingredient, technique, and format trends are real signals but are NOT dishes. If \
a post is about one and names no dish, omit the post entirely. Omitting is \
correct and expected -- much of the input is vlogs, hauls, and general food \
content with no dish in it. Do not force an assignment.

MATCHING
You are given the dishes found so far. If a post is about a dish already on that \
list, reuse its exact dish_id and dish_name. Only coin a new dish_id when it is \
genuinely a different dish.

Match on the dish, not the wording: "hot honey wings", "chili crisp wings", and \
"sweet heat wings" are one dish -- reuse the id and put the other surface forms \
in aliases. But keep genuinely different dishes apart: "birria tacos" and \
"birria grilled cheese" are different menu items even though both are birria.

SENTIMENT
Judge sentiment from the COMMENTS only. Titles and descriptions are written by \
the creator promoting their own video and are always positive -- they tell you \
what the dish is, not what people think of it.

positive = commenters like the dish, made it, want it
negative = commenters dislike it, find it overrated, overpriced, or are tired of it
neutral  = technique talk, questions, off-topic, or no clear opinion

If a post has no comments, use neutral. Do not infer sentiment from the title."""

REASON_SYSTEM = """\
You explain why a specific dish is trending, for a restaurant owner deciding \
whether to put it on their menu.

Ground every claim in the posts and comments provided. Do not add facts about \
the dish from general knowledge -- if the evidence does not support a claim, \
leave it out. An owner is going to spend money on this.

summary: 2-3 sentences. What is driving interest, and what it means for a \
restaurant. Be concrete and specific to this dish.

drivers: 3-4 short phrases naming what is pushing the trend. This is where an \
ingredient or technique trend belongs -- "chili crisp is having a broad moment" \
is a driver of the wings, not a dish of its own. Operational facts an owner \
would care about (no new equipment, cheap ingredient swap) belong here too.

audience: an age band and a dining occasion, e.g. "18-34, casual dining and \
late-night".

negative_theme: what the critics actually say, in one sentence. This is the most \
useful field in the record -- it tells the kitchen what to avoid and gives the \
marketing a thing to differentiate against. If genuinely nobody complained, \
return an empty string rather than inventing a criticism."""


# --------------------------------------------------------------------------
# Extraction
# --------------------------------------------------------------------------


def extract(posts: list[Post], config: dict[str, Any]) -> list[DishCluster]:
    """Cluster posts into dishes and explain each one."""
    if not posts:
        return []

    cfg = config.get("extraction", {})
    client = _client()
    if client is None:
        print("  [extract] ANTHROPIC_API_KEY not set; skipping extraction")
        return []

    clusters = _cluster(client, posts, cfg)
    print(f"  [extract] {len(clusters)} dishes from {len(posts)} posts")

    # Explain only the dishes that will survive ranking -- synthesis is one
    # call per dish, and a dish with a single mention is not going to make the
    # cut anyway.
    ranked = sorted(clusters.values(), key=lambda c: len(c.posts), reverse=True)
    for cluster in ranked[: cfg.get("explain_top_n", 20)]:
        _explain(client, cluster, cfg)

    return list(clusters.values())


def _client():
    """Build a client, or None if no credentials resolve.

    Deliberately does not test os.environ["ANTHROPIC_API_KEY"] directly -- the
    SDK also resolves ANTHROPIC_AUTH_TOKEN and `ant auth login` profiles, and
    an env-var check would refuse to run on a machine that is authenticated
    perfectly well.
    """
    try:
        import anthropic  # imported late so --offline works without the dep

        return anthropic.Anthropic()
    except Exception as exc:  # noqa: BLE001 - missing dep or unresolvable creds
        print(f"  [extract] no Anthropic client ({exc})")
        return None


def _cluster(client, posts: list[Post], cfg: dict) -> dict[str, DishCluster]:
    """Pass 1: assign posts to dishes, batch by batch."""
    batch_size = cfg.get("batch_size", 12)
    clusters: dict[str, DishCluster] = {}
    by_id = {p.id: p for p in posts}

    for start in range(0, len(posts), batch_size):
        batch = posts[start : start + batch_size]
        prompt = (
            f"{_known_dishes(clusters)}\n\n"
            f"POSTS TO ASSIGN\n\n" + "\n\n".join(_render(p) for p in batch)
        )

        try:
            response = client.messages.parse(
                model=cfg.get("model", MODEL),
                max_tokens=8000,
                thinking={"type": "adaptive"},
                output_config={"effort": cfg.get("effort", "medium")},
                system=[{
                    "type": "text",
                    "text": CLUSTER_SYSTEM,
                    # Stable across every batch; the volatile dish list and the
                    # posts both live in the user turn, after this breakpoint.
                    "cache_control": {"type": "ephemeral"},
                }],
                messages=[{"role": "user", "content": prompt}],
                output_format=Batch,
            )
        except Exception as exc:  # noqa: BLE001 - one bad batch should not kill a run
            print(f"  [extract] batch {start // batch_size + 1} failed ({exc}); skipping")
            continue

        for a in response.parsed_output.assignments:
            post = by_id.get(a.post_id)
            if post is None:  # model echoed an id that was not in the batch
                continue
            dish_id = _slug(a.dish_id)
            cluster = clusters.get(dish_id)
            if cluster is None:
                cluster = DishCluster(
                    id=dish_id, name=a.dish_name, cuisine_tags=a.cuisine_tags
                )
                clusters[dish_id] = cluster
            for alias in a.aliases:
                if alias.lower() != cluster.name.lower() and alias not in cluster.aliases:
                    cluster.aliases.append(alias)
            if post not in cluster.posts:
                cluster.posts.append(post)
                cluster.sentiments[post.id] = a.sentiment

    return clusters


def _explain(client, cluster: DishCluster, cfg: dict) -> None:
    """Pass 2: synthesize why_trending for one dish from its own evidence."""
    evidence = "\n\n".join(_render(p) for p in cluster.posts[:12])
    try:
        response = client.messages.parse(
            model=cfg.get("model", MODEL),
            max_tokens=4000,
            thinking={"type": "adaptive"},
            output_config={"effort": cfg.get("effort", "medium")},
            system=[{
                "type": "text",
                "text": REASON_SYSTEM,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{
                "role": "user",
                "content": f"DISH: {cluster.name}\n\nEVIDENCE\n\n{evidence}",
            }],
            output_format=Reasoning,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"  [extract] reasoning failed for {cluster.id} ({exc})")
        return

    r = response.parsed_output
    cluster.why_trending = WhyTrending(
        summary=r.summary, drivers=r.drivers, audience=r.audience
    )
    cluster.negative_theme = r.negative_theme


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------


def _render(post: Post) -> str:
    """One post as prompt text.

    Comments are labelled separately from the title so the sentiment rule in
    the system prompt has something to point at.
    """
    lines = [f"[{post.id}] ({post.scope})", f"TITLE: {post.text[:400]}"]
    if post.comments:
        lines.append("COMMENTS:")
        lines += [f"  - {c[:200]}" for c in post.comments[:8]]
    else:
        lines.append("COMMENTS: (none)")
    return "\n".join(lines)


def _known_dishes(clusters: dict[str, DishCluster]) -> str:
    if not clusters:
        return "DISHES FOUND SO FAR: (none yet -- this is the first batch)"
    lines = [
        f"  {c.id} | {c.name}" + (f" | aka {', '.join(c.aliases)}" if c.aliases else "")
        for c in clusters.values()
    ]
    return "DISHES FOUND SO FAR (reuse these ids when a post matches):\n" + "\n".join(lines)


def _slug(value: str) -> str:
    """Normalize model-supplied ids so casing or spacing never splits a dish."""
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
