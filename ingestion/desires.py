"""Audience asks hidden in video comments.

Titles name the dish the creator already filmed. Comments are where people
say the plate they actually want: a slider version, no cilantro, late night,
vegetarian. Those lines are the useful signal. This module only extracts them
— it does not invent dishes.
"""

from __future__ import annotations

import re
from typing import Any

ASK_PATTERNS = [
    re.compile(r"\bi want (?:to )?(?:make |try |eat |order |see |this (?:as |to be )?)?(.{4,90})", re.I),
    re.compile(r"\bi wish (?:there (?:was|were) |this had |you'd |you would )?(.{4,90})", re.I),
    re.compile(r"\bplease(?: please)*(?: make| do| try) (.{4,90})", re.I),
    re.compile(r"\bneed (?:a |an |the )?(.{4,70})", re.I),
    re.compile(r"\bcan you (?:please )?(?:make|do|try) (.{4,90})", re.I),
    re.compile(r"\byou should(?: literally)? (?:do|make|try) (.{4,90})", re.I),
    re.compile(r"\bi would (?:totally )?(?:eat|order|buy) (.{4,90})", re.I),
    re.compile(r"\bmake (?:this|it|one) (?:as |into |with )(.{4,70})", re.I),
]

JUNK = re.compile(
    r"^(to watch|to subscribe|a video|this video|more videos|the link|notifications)\b",
    re.I,
)


def extract_ask(comment: str) -> dict[str, str] | None:
    text = (comment or "").replace("\n", " ").strip()
    if len(text) < 8:
        return None
    for pattern in ASK_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        want = _clean(match.group(1))
        if not want or JUNK.match(want):
            continue
        return {"comment": text[:280], "ask": want, "kind": _kind(text)}
    return None


def extract_asks(comments: list[str]) -> list[dict[str, str]]:
    found: list[dict[str, str]] = []
    seen: set[str] = set()
    for comment in comments:
        row = extract_ask(comment)
        if not row:
            continue
        key = row["ask"].lower()
        if key in seen:
            continue
        seen.add(key)
        found.append(row)
    return found


def lab_from_videos(
    videos: list[dict[str, Any]],
    dishes: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Walk raw YouTube rows and say what we kept vs what Discover would show."""
    dishes = dishes or []
    by_id = _dish_index(dishes)
    posts: list[dict[str, Any]] = []
    asks: list[dict[str, Any]] = []

    for video in videos:
        video_id = str(video.get("id") or "")
        comments = [str(c) for c in (video.get("top_comments") or video.get("comments") or []) if c]
        found = extract_asks(comments)
        dish = by_id.get(video_id)
        post = {
            "id": video_id,
            "title": video.get("title") or "",
            "channel": video.get("channel") or "",
            "url": video.get("url") or (f"https://www.youtube.com/watch?v={video_id}" if video_id else ""),
            "views": video.get("view_count") or video.get("views") or 0,
            "query": video.get("matched_query") or "",
            "comments": comments,
            "asks": found,
            "operatorDish": dish["name"] if dish else None,
            "operatorDishId": dish["id"] if dish else None,
            "fate": _fate(found, dish),
        }
        posts.append(post)
        for ask in found:
            asks.append({
                **ask,
                "videoId": video_id,
                "videoTitle": post["title"],
                "url": post["url"],
                "operatorDish": post["operatorDish"],
            })

    return {
        "source": "youtube",
        "videoCount": len(posts),
        "commentCount": sum(len(p["comments"]) for p in posts),
        "askCount": len(asks),
        "shownToOperator": sum(1 for p in posts if p["operatorDish"]),
        "asksNotShipped": sum(1 for a in asks if not a["operatorDish"]),
        "posts": posts,
        "asks": asks,
    }


def _fate(asks: list[dict[str, str]], dish: dict[str, Any] | None) -> str:
    if dish and asks:
        return "shown — comments also asked for a twist"
    if dish:
        return "shown to operator — no ask extracted"
    if asks:
        return "ask captured — no dish card shipped"
    return "raw only — not clustered, not shown"


def _dish_index(dishes: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for dish in dishes:
        for item in dish.get("evidence") or []:
            url = str(item.get("url") or "")
            video_id = _id_from_url(url)
            if video_id:
                index[video_id] = dish
    return index


def _id_from_url(url: str) -> str:
    match = re.search(r"(?:v=|/shorts/)([A-Za-z0-9_-]{6,})", url)
    return match.group(1) if match else ""


def _clean(value: str) -> str:
    text = re.split(r"[.!?|]", value, maxsplit=1)[0]
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"\s+", " ", text).strip(" -–—,;:")
    if len(text) < 4:
        return ""
    return text[:90]


def _kind(comment: str) -> str:
    lower = comment.lower()
    if re.search(r"\b(without|no |vegetarian|vegan|gluten)\b", lower):
        return "constraint"
    if re.search(r"\b(as a |slider|wrap|taco|late night|version|with )\b", lower):
        return "variant"
    return "request"
