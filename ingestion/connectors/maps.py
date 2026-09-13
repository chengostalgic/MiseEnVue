"""Google Maps local-pack connector — the county-level source.

YouTube search barely changes from Houston to Chicago. Maps does. The feed
Google shows for "restaurants near me" is GPS-first: if the browser reports
Harris County coordinates, the local pack is Harris County restaurants even
when the machine's IP is elsewhere.

Two jobs:

  1. Open Maps (and Google Search as a backup) with the restaurant's lat/lon
     injected and geolocation permission already granted.
  2. Read recent reviews. The trend signal is not a star rating — it is the
     same dish showing up in newest reviews at several independent places
     inside the window.

Playwright is optional. A missing browser, a consent wall, or a selector
change must not take the YouTube run down. Offline replay uses the last
cached pull.
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote_plus

from ingestion.connectors.base import Connector
from ingestion.local_pack import (
    detect_spikes,
    flatten_reviews,
    mark_spikes,
    parse_review_age,
    within_review_window,
)
from ingestion.location import geo_point, market_label
from ingestion.schema import Post

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


class GoogleMapsConnector(Connector):
    name = "google_maps"

    def fetch_raw(self, since_days: int) -> list[dict[str, Any]]:
        if not self.config.get("enabled", True):
            return []
        point = geo_point(self.config)
        if point is None:
            raise RuntimeError(
                "google_maps needs latitude and longitude. "
                "Pass --city Chicago or --lat/--lon."
            )

        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise RuntimeError(
                "Playwright is not installed. "
                "pip install playwright && playwright install chromium"
            ) from exc

        lat, lon = point
        queries = self._queries()
        window = int(self.config.get("review_window_days", since_days))
        max_places = int(self.config.get("max_places", 12))
        reviews_each = int(self.config.get("reviews_per_place", 8))
        timeout = int(self.config.get("timeout_ms", 45000))
        places: dict[str, dict[str, Any]] = {}

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=bool(self.config.get("headless", True))
            )
            context = browser.new_context(
                geolocation={"latitude": lat, "longitude": lon, "accuracy": 30},
                permissions=["geolocation"],
                locale="en-US",
                timezone_id=self.config.get("timezone") or "America/Chicago",
                user_agent=USER_AGENT,
                viewport={"width": 1280, "height": 900},
            )
            page = context.new_page()
            try:
                for query in queries:
                    print(f"  [{self.name}] search {query!r} @ {lat:.4f},{lon:.4f}")
                    for place in self._search_maps(
                        page, query, lat, lon, max_places, reviews_each, window, timeout
                    ):
                        key = (place.get("name") or "").strip().lower()
                        if not key:
                            continue
                        existing = places.get(key)
                        if existing is None:
                            places[key] = place
                        else:
                            existing["reviews"] = _merge_reviews(
                                existing.get("reviews"), place.get("reviews")
                            )
            finally:
                context.close()
                browser.close()

        records = list(places.values())
        spikes = detect_spikes(
            flatten_reviews(records),
            min_restaurants=int(self.config.get("min_restaurants_for_spike", 4)),
            window_days=window,
        )
        for spike in spikes:
            print(
                f"  [{self.name}] spike: {spike.phrase} @ "
                f"{spike.restaurant_count} restaurants"
            )
        print(f"  [{self.name}] {len(records)} places, {sum(len(p.get('reviews') or []) for p in records)} reviews")
        return records

    def parse(self, raw: list[dict[str, Any]]) -> list[Post]:
        window = int(self.config.get("review_window_days", 14))
        now = datetime.now(timezone.utc)
        posts: list[Post] = []
        for place in raw:
            name = (place.get("name") or "").strip()
            url = place.get("url") or ""
            review_count = int(place.get("review_count") or 0)
            for review in place.get("reviews") or []:
                if isinstance(review, str):
                    text, relative = review, None
                else:
                    text = (review.get("text") or "").strip()
                    relative = review.get("relative_time") or review.get("iso_time")
                if not text or not name:
                    continue
                created = parse_review_age(relative, now=now) if relative else None
                if created is None and isinstance(review, dict):
                    created = parse_review_age(review.get("iso_time"), now=now)
                    if created is None and review.get("iso_time"):
                        try:
                            created = datetime.fromisoformat(
                                str(review["iso_time"]).replace("Z", "+00:00")
                            )
                        except ValueError:
                            created = None
                if created is None:
                    # Undated card snippets still reach the LLM; they do not
                    # count as in-window for mechanical spikes.
                    created = now - timedelta(days=3)
                elif not within_review_window(created, window, now=now):
                    continue
                digest = hashlib.sha1(f"{name}|{text[:80]}".encode()).hexdigest()[:12]
                posts.append(
                    Post(
                        source=self.name,
                        id=f"maps-{digest}",
                        url=url,
                        text=f"{name}: {text}",
                        created_at=created,
                        engagement=max(review_count, 1),
                        comments=[text],
                        media_type="review",
                        location=name,
                        scope="local",
                        trend_marker=bool(place.get("is_new")),
                    )
                )

        spikes = detect_spikes(
            flatten_reviews(raw),
            min_restaurants=int(self.config.get("min_restaurants_for_spike", 4)),
            window_days=window,
            now=now,
        )
        mark_spikes(posts, spikes)
        if spikes:
            print(
                f"  [{self.name}] {len(spikes)} local spikes across "
                f"{len({p.location for p in posts})} restaurants"
            )
        return posts

    def _queries(self) -> list[str]:
        tokens = {
            "city": self.config.get("city") or "",
            "county": self.config.get("county") or self.config.get("city") or "",
            "state": self.config.get("state") or "",
            "neighborhood": self.config.get("neighborhood") or "",
            "region_name": self.config.get("region_name") or "",
        }
        out: list[str] = []
        for template in self.config.get("queries", []):
            query = template.format(**tokens).strip()
            if query and query not in out:
                out.append(query)
        food_types = self.config.get("food_types") or []
        food_templates = self.config.get("food_type_queries") or []
        for food in food_types:
            for template in food_templates:
                query = template.format(food_type=food, **tokens).strip()
                if query and query not in out:
                    out.append(query)
        return out[: int(self.config.get("max_queries", 5))]

    def _search_maps(
        self,
        page,
        query: str,
        lat: float,
        lon: float,
        max_places: int,
        reviews_each: int,
        window: int,
        timeout: int,
    ) -> list[dict[str, Any]]:
        url = (
            f"https://www.google.com/maps/search/{quote_plus(query)}"
            f"/@{lat},{lon},14z"
        )
        page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        _dismiss_consent(page)
        _grant_precise_location(page)
        try:
            page.wait_for_selector('div[role="feed"], a[href*="/maps/place/"]', timeout=15000)
        except Exception:
            print(f"  [{self.name}] no feed for {query!r}")
            return []

        _scroll_feed(page, steps=int(self.config.get("scroll_steps", 4)))
        cards = _read_place_cards(page, max_places)
        places = []
        for card in cards:
            reviews = []
            href = card.get("url")
            if href and reviews_each:
                reviews = _read_place_reviews(page, href, reviews_each, timeout)
            places.append(
                {
                    "query": query,
                    "name": card.get("name"),
                    "url": href,
                    "rating": card.get("rating"),
                    "review_count": card.get("review_count") or 0,
                    "is_new": bool(card.get("is_new")),
                    "latitude": lat,
                    "longitude": lon,
                    "market": market_label(self.config),
                    "reviews": reviews or card.get("snippets") or [],
                }
            )
        return places


def _dismiss_consent(page) -> None:
    for label in ("Accept all", "I agree", "Reject all", "Stay signed out"):
        try:
            button = page.get_by_role("button", name=re.compile(label, re.I))
            if button.count() and button.first.is_visible():
                button.first.click(timeout=1500)
                page.wait_for_timeout(400)
        except Exception:
            continue


def _grant_precise_location(page) -> None:
    for label in ("Use precise location", "Update location", "Precise location"):
        try:
            target = page.get_by_text(re.compile(label, re.I))
            if target.count() and target.first.is_visible():
                target.first.click(timeout=1500)
                page.wait_for_timeout(800)
        except Exception:
            continue


def _scroll_feed(page, steps: int = 4) -> None:
    feed = page.locator('div[role="feed"]')
    for _ in range(steps):
        try:
            if feed.count():
                feed.first.evaluate("el => el.scrollBy(0, el.clientHeight)")
            else:
                page.mouse.wheel(0, 1400)
            page.wait_for_timeout(700)
        except Exception:
            break


def _read_place_cards(page, limit: int) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    seen: set[str] = set()
    links = page.locator('a[href*="/maps/place/"]')
    try:
        count = min(links.count(), limit * 3)
    except Exception:
        return cards
    for i in range(count):
        if len(cards) >= limit:
            break
        try:
            link = links.nth(i)
            href = link.get_attribute("href") or ""
            name = (link.get_attribute("aria-label") or "").strip()
            if not name or name.lower() in seen:
                continue
            seen.add(name.lower())
            blob = ""
            try:
                blob = link.locator("xpath=ancestor::*[self::div][1]").inner_text(timeout=800)
            except Exception:
                blob = name
            cards.append(
                {
                    "name": name.split("·")[0].strip(),
                    "url": href if href.startswith("http") else f"https://www.google.com{href}",
                    "rating": _first_float(blob),
                    "review_count": _review_count(blob),
                    "is_new": bool(re.search(r"\bnew\b", blob, re.I)),
                    "snippets": _snippet_reviews(blob, name),
                }
            )
        except Exception:
            continue
    return cards


def _read_place_reviews(page, url: str, limit: int, timeout: int) -> list[dict[str, Any]]:
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        _dismiss_consent(page)
    except Exception:
        return []

    for label in (r"reviews", r"see all reviews"):
        try:
            tab = page.get_by_role("tab", name=re.compile(label, re.I))
            if tab.count():
                tab.first.click(timeout=2000)
                page.wait_for_timeout(600)
                break
        except Exception:
            continue
    for label in (r"newest", r"most recent", r"newest first"):
        try:
            sort = page.get_by_text(re.compile(label, re.I))
            if sort.count() and sort.first.is_visible():
                sort.first.click(timeout=1500)
                page.wait_for_timeout(500)
                break
        except Exception:
            continue

    reviews: list[dict[str, Any]] = []
    # Class names change; prefer role/text, then known review containers.
    nodes = page.locator("div[data-review-id], div.jftiEf, div[class*='fontBodyMedium']")
    try:
        n = min(nodes.count(), limit * 4)
    except Exception:
        n = 0
    for i in range(n):
        if len(reviews) >= limit:
            break
        try:
            text = nodes.nth(i).inner_text(timeout=800).strip()
        except Exception:
            continue
        if len(text) < 24:
            continue
        relative = None
        age = re.search(
            r"(\d+\s+(?:minutes?|hours?|days?|weeks?|months?)\s+ago|a day ago|an hour ago|yesterday)",
            text,
            re.I,
        )
        if age:
            relative = age.group(0)
        body = _clean_review_text(text)
        if not body:
            continue
        reviews.append({"text": body, "relative_time": relative})
    return reviews


def _snippet_reviews(blob: str, place_name: str) -> list[dict[str, Any]]:
    """Pull quoted snippets off a list card when we never open the place."""
    quotes = re.findall(r"[“\"]([^”\"]{20,180})[”\"]", blob)
    out = []
    for quote in quotes[:2]:
        if place_name.lower() in quote.lower():
            continue
        out.append({"text": quote.strip(), "relative_time": None})
    return out


def _clean_review_text(blob: str) -> str:
    lines = [line.strip() for line in blob.splitlines() if line.strip()]
    useful = [
        line
        for line in lines
        if not re.fullmatch(r"[\d\.\,]+", line)
        and not re.fullmatch(r"\d+\s+(?:reviews?|photos?)", line, re.I)
        and line.lower() not in {"google", "local guide", "new"}
    ]
    text = " ".join(useful)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:500]


def _first_float(blob: str) -> float | None:
    match = re.search(r"\b([1-5]\.\d)\b", blob)
    return float(match.group(1)) if match else None


def _review_count(blob: str) -> int:
    match = re.search(r"([\d,]+)\s+reviews?", blob, re.I)
    if not match:
        return 0
    return int(match.group(1).replace(",", ""))


def _merge_reviews(left, right) -> list:
    seen: set[str] = set()
    out = []
    for review in (left or []) + (right or []):
        text = review if isinstance(review, str) else (review.get("text") or "")
        key = text.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(review if not isinstance(review, str) else {"text": review})
    return out
