"""County-level trend signal from Google Maps reviews.

YouTube tells you what food media is covering. Maps reviews tell you what
diners in this county actually ordered last week. The useful unit is not a
single glowing review — it is the same dish showing up at several independent
restaurants inside the review window.

This module is mechanical on purpose. Phrase counting happens before the LLM
so a local spike is visible even when Claude is down, and so the model is
handed a pre-grouped claim ("7 Harris County restaurants mentioned hot honey
smash burger in 14 days") instead of a pile of unstructured blurbs.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable

from ingestion.schema import Post

_STOP = {
    "the", "and", "for", "with", "from", "this", "that", "have", "been",
    "were", "your", "their", "about", "just", "very", "really", "here",
    "place", "food", "good", "great", "best", "nice", "love", "liked",
    "amazing", "delicious", "awesome", "super", "also", "they", "them",
    "order", "ordered", "got", "get", "had", "was", "are", "our", "you",
}

# Review noise — not a dish list. Unknown plates ("corn ribs", "dubai
# chocolate") have to be allowed through before anyone adds them here.
_NOISE = _STOP | {
    "service", "staff", "atmosphere", "ambiance", "wait", "waiting",
    "parking", "price", "priced", "prices", "portion", "portions",
    "vibe", "experience", "server", "waiter", "waitress", "manager",
    "bathroom", "restroom", "dirty", "clean", "loud", "crowded",
    "busy", "empty", "table", "reservation", "hostess", "tip", "bill",
    "check", "minutes", "hours", "stars", "star", "review", "yelp",
    "google", "came", "visit", "visited", "back", "again", "always",
    "never", "still", "even", "much", "more", "less", "little",
}

_RELATIVE = [
    (re.compile(r"(\d+)\s*min", re.I), lambda n: timedelta(minutes=n)),
    (re.compile(r"an?\s+hour", re.I), lambda _: timedelta(hours=1)),
    (re.compile(r"(\d+)\s*hours?", re.I), lambda n: timedelta(hours=n)),
    (re.compile(r"yesterday", re.I), lambda _: timedelta(days=1)),
    (re.compile(r"an?\s+day", re.I), lambda _: timedelta(days=1)),
    (re.compile(r"(\d+)\s*days?", re.I), lambda n: timedelta(days=n)),
    (re.compile(r"an?\s+week", re.I), lambda _: timedelta(weeks=1)),
    (re.compile(r"(\d+)\s*weeks?", re.I), lambda n: timedelta(weeks=n)),
    (re.compile(r"an?\s+month", re.I), lambda _: timedelta(days=30)),
    (re.compile(r"(\d+)\s*months?", re.I), lambda n: timedelta(days=30 * n)),
]

_TOKEN = re.compile(r"[a-z0-9]+(?:'[a-z]+)?")


@dataclass(frozen=True)
class ReviewSpike:
    """One dish-like phrase seen at several restaurants in the window."""

    phrase: str
    restaurant_count: int
    restaurants: tuple[str, ...]
    excerpts: tuple[str, ...]


def parse_review_age(value: str | None, now: datetime | None = None) -> datetime | None:
    """Turn '3 days ago' / 'a week ago' into an aware timestamp.

    Google Maps almost never gives an absolute date on the list view. If we
    cannot parse the relative string, return None so the caller can drop the
    review rather than pretend it is new.
    """
    if not value:
        return None
    blob = value.strip()
    if not blob:
        return None
    now = now or datetime.now(timezone.utc)
    if blob.lower() in {"today", "just now", "a moment ago"}:
        return now
    for pattern, to_delta in _RELATIVE:
        match = pattern.search(blob)
        if not match:
            continue
        raw = match.group(1) if match.lastindex else "1"
        try:
            count = int(raw)
        except ValueError:
            count = 1
        return now - to_delta(count)
    return None


def within_review_window(
    created_at: datetime | None,
    window_days: int,
    now: datetime | None = None,
) -> bool:
    if created_at is None:
        return False
    now = now or datetime.now(timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return created_at >= now - timedelta(days=window_days)


def extract_food_phrases(text: str, max_n: int = 4) -> list[str]:
    """2–4 gram candidates that do not look like review filler."""
    tokens = _TOKEN.findall(text.lower())
    if len(tokens) < 2:
        return []
    found: list[str] = []
    seen: set[str] = set()
    for n in range(2, max_n + 1):
        for i in range(len(tokens) - n + 1):
            gram = tokens[i : i + n]
            if gram[0] in _STOP or gram[-1] in _STOP:
                continue
            phrase = " ".join(gram)
            if phrase in seen:
                continue
            if not _looks_like_dish(phrase):
                continue
            seen.add(phrase)
            found.append(phrase)
    return found


def detect_spikes(
    reviews: Iterable[dict],
    min_restaurants: int = 4,
    window_days: int = 14,
    now: datetime | None = None,
) -> list[ReviewSpike]:
    """Group recent reviews by dish-like phrase and keep the county spikes.

    `reviews` is a raw connector record: restaurant, text, created_at.
    Longer phrases win when they cover a shorter one at the same restaurants,
    so "hot honey smash burger" is not reported three times as "hot honey",
    "honey smash", and the full name.
    """
    now = now or datetime.now(timezone.utc)
    by_phrase: dict[str, dict[str, str]] = defaultdict(dict)
    for review in reviews:
        created = review.get("created_at")
        if isinstance(created, str):
            created = parse_review_age(created, now=now) or _parse_iso(created)
        if not within_review_window(created, window_days, now=now):
            continue
        restaurant = (review.get("restaurant") or review.get("name") or "").strip()
        text = (review.get("text") or "").strip()
        if not restaurant or not text:
            continue
        for phrase in extract_food_phrases(text):
            by_phrase[phrase].setdefault(restaurant, text)

    spikes = [
        ReviewSpike(
            phrase=phrase,
            restaurant_count=len(places),
            restaurants=tuple(sorted(places)),
            excerpts=tuple(places[name][:180] for name in sorted(places)),
        )
        for phrase, places in by_phrase.items()
        if len(places) >= min_restaurants
    ]
    return _collapse_contained(spikes)


def mark_spikes(posts: list[Post], spikes: list[ReviewSpike]) -> list[Post]:
    """Tag Maps posts that participate in a county spike.

    trend_marker is the same flag YouTube uses for 'I tried the viral X'.
    Here it means the diner mentioned a dish other nearby restaurants also
    mentioned this window — that is the local equivalent of a breakout.
    """
    if not spikes:
        return posts
    phrases = [s.phrase for s in spikes]
    spiked_places = {place.lower() for spike in spikes for place in spike.restaurants}
    for post in posts:
        if post.source != "google_maps":
            continue
        blob = f"{post.text} {post.location or ''}".lower()
        if any(phrase in blob for phrase in phrases) or (post.location or "").lower() in spiked_places:
            if any(phrase in (post.text or "").lower() for phrase in phrases):
                post.trend_marker = True
                post.is_viral = True
    return posts


def spike_context(spikes: list[ReviewSpike], county: str | None = None) -> str:
    """Prompt block so the model sees the mechanical claim first."""
    if not spikes:
        return "LOCAL SPIKES: none crossed the restaurant-count floor this window."
    where = f" in {county}" if county else ""
    lines = [f"LOCAL SPIKES{where} (same dish, several restaurants, recent reviews):"]
    for spike in sorted(spikes, key=lambda s: s.restaurant_count, reverse=True):
        places = ", ".join(spike.restaurants[:8])
        extra = f" +{spike.restaurant_count - 8} more" if spike.restaurant_count > 8 else ""
        lines.append(
            f"- {spike.phrase}: {spike.restaurant_count} restaurants ({places}{extra})"
        )
    return "\n".join(lines)


def flatten_reviews(raw: list[dict]) -> list[dict]:
    """Expand place-plus-reviews payloads into one dict per review."""
    out = []
    for place in raw:
        name = place.get("name") or place.get("restaurant")
        for review in place.get("reviews") or []:
            if isinstance(review, str):
                out.append({"restaurant": name, "text": review, "created_at": None})
                continue
            out.append(
                {
                    "restaurant": name,
                    "text": review.get("text") or "",
                    "created_at": review.get("relative_time") or review.get("iso_time") or review.get("created_at"),
                    "url": place.get("url") or review.get("url"),
                }
            )
    return out


def _looks_like_dish(phrase: str) -> bool:
    return not any(token in _NOISE for token in phrase.split())


def _collapse_contained(spikes: list[ReviewSpike]) -> list[ReviewSpike]:
    """Drop a shorter phrase when a longer one covers the same restaurants."""
    ranked = sorted(spikes, key=lambda s: (s.restaurant_count, len(s.phrase)), reverse=True)
    kept: list[ReviewSpike] = []
    for spike in ranked:
        covered = False
        for other in kept:
            if spike.phrase in other.phrase or other.phrase in spike.phrase:
                if set(spike.restaurants) <= set(other.restaurants):
                    covered = True
                    break
        if not covered:
            kept.append(spike)
    return kept


def _parse_iso(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
