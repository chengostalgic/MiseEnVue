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
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import BaseModel, Field

from ingestion.local_pack import detect_spikes, spike_context
from ingestion.normalize import select_for_extract
from ingestion.schema import Post, WhyTrending

# Clustering is high-volume classification and synthesis is short-form
# summarization over pre-selected evidence -- neither needs a frontier model,
# and clustering is where nearly all the tokens go. Bump these in config.yaml
# if output quality warrants the cost.
CLUSTER_MODEL = "claude-haiku-4-5"
REASON_MODEL = "claude-haiku-4-5"

# Adaptive thinking and the effort parameter are rejected with a 400 on models
# older than the 4.6 family, so requests are built per-model rather than
# assuming the newer surface.
_ADAPTIVE_THINKING_MODELS = ("claude-opus-", "claude-sonnet-5", "claude-sonnet-4-6", "claude-fable-")


def _model_params(model: str, effort: str) -> dict:
    """Thinking/effort params the given model actually accepts."""
    if model.startswith(_ADAPTIVE_THINKING_MODELS):
        return {"thinking": {"type": "adaptive"}, "output_config": {"effort": effort}}
    return {}


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
    summary: str = Field(description="one sentence on the signal, no advice")
    drivers: list[str] = Field(description="1-2 evidence facts")
    audience: str = Field(description="short phrase or empty")
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

Omit celebrity interviews, talk-show appearances, and brand features where a \
dish is mentioned in passing ("X loves Hooters wings", "joins to talk about \
food"). Keep a post only when the video is making, tasting, or reviewing the \
dish as its subject.

Ingredient, technique, and format trends are real signals but are NOT dishes. If \
a post is about one and names no dish, omit the post entirely. Omitting is \
correct and expected -- much of the input is vlogs, hauls, and general food \
content with no dish in it. Do not force an assignment.

MARKET RELEVANCE
Keep a nameable dish from anywhere people are making it, lining up for it, or \
filming it. Seoul cafe desserts, Tokyo convenience-store snacks, Mexico City \
street food, and a US smash burger are the same job. Do not drop a post because \
it is not aimed at a US restaurant, or because the cuisine is "too foreign".

When genuinely unsure, keep the dish.

MATCHING
You are given the dishes found so far. If a post is about a dish already on that \
list, reuse its exact dish_id and dish_name. Only coin a new dish_id when it is \
genuinely a different dish.

Match on the dish, not the wording: "hot honey wings", "chili crisp wings", and \
"sweet heat wings" are one dish -- reuse the id and put the other surface forms \
in aliases. But keep genuinely different dishes apart: "birria tacos" and \
"birria grilled cheese" are different menu items even though both are birria.

LOCAL MAPS REVIEWS
Some posts are recent Google Maps reviews from restaurants in the restaurant's \
county, not videos. A review that names a dish is a mention. If several \
independent restaurants' newest reviews name the same dish, that is a \
county-level trend even if no YouTube video covered it. Reuse a dish_id from \
the national list when the review is about the same dish -- a national viral \
item showing up in local reviews is the strongest signal in the pipeline.

SENTIMENT
Judge sentiment from the COMMENTS only. Titles and descriptions are written by \
the creator promoting their own video and are always positive -- they tell you \
what the dish is, not what people think of it. For a Maps review the review \
text itself is the comment.

positive = commenters like the dish, made it, want it
negative = commenters dislike it, find it overrated, overpriced, or are tired of it
neutral  = technique talk, questions, off-topic, or no clear opinion

If a post has no comments, use neutral. Do not infer sentiment from the title."""

REASON_SYSTEM = """\
Write a short discover card for this dish. Facts only, from the evidence.

Do not advise the kitchen. Do not say whether they should run it, how it \
fits a menu, or what a campaign should do. Do not invent facts from \
general knowledge.

When Maps reviews are present, name how many restaurants mentioned the dish \
and the window. One restaurant is not a local trend.

summary: one sentence. Who is talking about it and how big the signal is.

drivers: 1-2 evidence facts (view counts, restaurant count, search lift). \
No operational advice.

audience: a short phrase, or empty.

negative_theme: one sentence of what critics said, or empty."""


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
        return []

    posts = select_for_extract(posts, cfg)
    maps_posts = [p for p in posts if p.source == "google_maps"]
    other_posts = [p for p in posts if p.source != "google_maps"]
    clusters = _cluster(client, other_posts, cfg) if other_posts else {}
    if maps_posts:
        _cluster_local_reviews(client, maps_posts, clusters, cfg, config)
    print(f"  [extract] {len(clusters)} dishes from {len(posts)} posts")

    # Explain only the dishes that will survive ranking -- synthesis is one
    # call per dish, and a dish with a single mention is not going to make the
    # cut anyway.
    ranked = sorted(clusters.values(), key=lambda c: len(c.posts), reverse=True)
    to_explain = ranked[: cfg.get("explain_top_n", 20)]

    # Synthesis calls are independent, so run them concurrently. Sequentially
    # this was the slowest stage in the pipeline by a wide margin -- twenty
    # calls at ~8s each is nearly three minutes of a demo spent watching a
    # terminal do nothing.
    workers = min(cfg.get("synthesis_workers", 8), len(to_explain) or 1)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(lambda c: _explain(client, c, cfg), to_explain))

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

        model = cfg.get("cluster_model", CLUSTER_MODEL)
        try:
            response = client.messages.parse(
                model=model,
                max_tokens=8000,
                **_model_params(model, cfg.get("effort", "medium")),
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


LOCAL_REVIEW_SYSTEM = """\
You identify dishes local diners are ordering right now, from Google Maps reviews.

Each post is one recent review of one restaurant in the target county. A dish \
is a nameable menu item. "hot honey smash burger" is a dish. "great service" \
is not. "New" or a review from the last two weeks is stronger evidence than \
an undated blurb.

You are also given LOCAL SPIKES: phrases that already appeared at several \
independent restaurants this window. Those are county-level trends. Assign \
the matching reviews to one dish_id and reuse a dish from the national list \
when it is the same item. Only coin a new dish_id when the local reviews are \
about something YouTube never covered.

Omit a review that names no dish. Sentiment comes from the review text itself."""


def _cluster_local_reviews(
    client,
    posts: list[Post],
    clusters: dict[str, DishCluster],
    cfg: dict,
    config: dict[str, Any],
) -> None:
    """Second clustering pass: county reviews, with national dishes in context."""
    maps_cfg = config.get("google_maps") or {}
    loc = config.get("location") or {}
    reviews = [
        {
            "restaurant": p.location or "",
            "text": p.comments[0] if p.comments else p.text,
            "created_at": p.created_at,
        }
        for p in posts
    ]
    spikes = detect_spikes(
        reviews,
        min_restaurants=int(maps_cfg.get("min_restaurants_for_spike", 4)),
        window_days=int(maps_cfg.get("review_window_days", 14)),
    )
    hint = spike_context(spikes, loc.get("county") or loc.get("city"))
    by_id = {p.id: p for p in posts}
    batch_size = min(int(cfg.get("maps_batch_size", 30)), 40)
    assigned = 0

    for start in range(0, len(posts), batch_size):
        batch = posts[start : start + batch_size]
        prompt = (
            f"{hint}\n\n{_known_dishes(clusters)}\n\n"
            f"REVIEWS TO ASSIGN\n\n" + "\n\n".join(_render(p) for p in batch)
        )
        model = cfg.get("cluster_model", CLUSTER_MODEL)
        try:
            response = client.messages.parse(
                model=model,
                max_tokens=8000,
                **_model_params(model, cfg.get("effort", "medium")),
                system=[{
                    "type": "text",
                    "text": LOCAL_REVIEW_SYSTEM,
                    "cache_control": {"type": "ephemeral"},
                }],
                messages=[{"role": "user", "content": prompt}],
                output_format=Batch,
            )
        except Exception as exc:  # noqa: BLE001
            print(f"  [extract] maps batch {start // batch_size + 1} failed ({exc}); skipping")
            continue

        for assignment in response.parsed_output.assignments:
            post = by_id.get(assignment.post_id)
            if post is None:
                continue
            dish_id = _slug(assignment.dish_id)
            cluster = clusters.get(dish_id)
            if cluster is None:
                cluster = DishCluster(
                    id=dish_id, name=assignment.dish_name, cuisine_tags=assignment.cuisine_tags
                )
                clusters[dish_id] = cluster
            for alias in assignment.aliases:
                if alias.lower() != cluster.name.lower() and alias not in cluster.aliases:
                    cluster.aliases.append(alias)
            if post not in cluster.posts:
                cluster.posts.append(post)
                cluster.sentiments[post.id] = assignment.sentiment
                assigned += 1

    print(f"  [extract] maps reviews: {assigned}/{len(posts)} assigned, {len(spikes)} spikes")


def _explain(client, cluster: DishCluster, cfg: dict) -> None:
    """Pass 2: synthesize why_trending for one dish from its own evidence."""
    evidence = "\n\n".join(_render(p) for p in cluster.posts[:12])
    model = cfg.get("reason_model", REASON_MODEL)
    try:
        response = client.messages.parse(
            model=model,
            max_tokens=4000,
            **_model_params(model, cfg.get("effort", "medium")),
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
    if post.source == "google_maps":
        lines = [
            f"[{post.id}] (local/google_maps)",
            f"RESTAURANT: {post.location or 'unknown'}",
            f"REVIEW: {(post.comments[0] if post.comments else post.text)[:400]}",
        ]
        return "\n".join(lines)

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
