"""Virality, scoring, and location — the bits that decide what looks 'viral'."""

from __future__ import annotations

import unittest
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from ingestion.connectors.maps import GoogleMapsConnector
from ingestion.local_pack import detect_spikes, parse_review_age
from ingestion.queries import build_discovery_queries
from ingestion.location import geo_point, resolve_location
from ingestion.normalize import select_for_extract
from ingestion.schema import Post, WhyTrending
from ingestion.score import score_all
from ingestion.virality import annotate


@dataclass
class Cluster:
    id: str
    name: str
    posts: list
    aliases: list = field(default_factory=list)
    cuisine_tags: list = field(default_factory=list)
    sentiments: dict = field(default_factory=dict)
    why_trending: WhyTrending = field(default_factory=lambda: WhyTrending(summary=""))
    negative_theme: str = ""


def _video(vid, channel, views, title, days=2, is_short=False):
    published = (datetime.now(timezone.utc) - timedelta(days=days)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    return {
        "id": vid,
        "channel_id": channel,
        "view_count": views,
        "title": title,
        "description": "",
        "published_at": published,
        "is_short": is_short,
    }


def _post(**kwargs):
    defaults = dict(
        source="youtube",
        id="p1",
        url="https://youtu.be/x",
        text="dish",
        created_at=datetime.now(timezone.utc) - timedelta(days=1),
        engagement=10_000,
        scope="national",
    )
    defaults.update(kwargs)
    return Post(**defaults)


class ViralityTests(unittest.TestCase):
    def test_sparse_channel_has_no_fake_breakout(self):
        videos = {
            "a": _video("a", "tiny", 80_000, "The pasta everyone is making", days=1),
        }
        annotate(videos, {"min_views": 15_000, "breakout_ratio": 2.0, "min_views_per_day": 15_000})
        self.assertIsNone(videos["a"]["breakout_ratio"])
        self.assertTrue(videos["a"]["is_viral"])  # surging, not a 80,000x breakout

    def test_breakout_without_trend_word_is_viral(self):
        videos = {
            "a": _video("a", "ch", 40_000, "Weeknight gnocchi"),
            "b": _video("b", "ch", 45_000, "Soup"),
            "c": _video("c", "ch", 200_000, "Crispy rice salad"),
        }
        annotate(videos, {"min_views": 15_000, "breakout_ratio": 2.0, "require_trend_marker": False})
        self.assertGreaterEqual(videos["c"]["breakout_ratio"], 2.0)
        self.assertTrue(videos["c"]["is_viral"])
        self.assertFalse(videos["c"]["trend_marker"])

    def test_interview_is_evergreen(self):
        videos = {
            "a": _video("a", "ba", 100_000, "Tuesday dinner"),
            "b": _video("b", "ba", 110_000, "Wednesday dinner"),
            "c": _video("c", "ba", 4_000_000, "Sam Smith joins Bon Appétit and talks about food"),
        }
        annotate(videos, {})
        self.assertTrue(videos["c"]["is_evergreen"])
        self.assertFalse(videos["a"]["is_evergreen"])


class ScoreTests(unittest.TestCase):
    def test_interview_loses_to_real_breakout(self):
        interview = Cluster(
            id="hooters-wings",
            name="Hooters Wings",
            posts=[
                _post(id="i1", location="Bon Appétit", engagement=4_000_000, is_evergreen=True, breakout_ratio=20.0),
                _post(id="i2", location="Bon Appétit", engagement=3_000, is_evergreen=True, breakout_ratio=0.1),
            ],
            why_trending=WhyTrending(summary="celebrity"),
        )
        breakout = Cluster(
            id="crispy-rice",
            name="Crispy Rice Salad",
            posts=[
                _post(id="b1", location="Lynja", engagement=220_000, breakout_ratio=3.5, trend_marker=True, is_viral=True, views_per_day=80_000),
                _post(id="b2", location="QCP", engagement=90_000, breakout_ratio=2.4, trend_marker=True, is_viral=True, views_per_day=40_000),
            ],
            why_trending=WhyTrending(summary="breakout"),
        )
        dishes = score_all(
            [interview, breakout],
            window_days=7,
            config={
                "output": {"min_mentions": 2, "max_dishes": 10},
                "scoring": {
                    "weights": {
                        "reach": 0.22,
                        "virality": 0.30,
                        "velocity": 0.18,
                        "volume": 0.10,
                        "breadth": 0.08,
                        "recency": 0.07,
                        "local": 0.05,
                    }
                },
            },
        )
        self.assertEqual(dishes[0].id, "crispy-rice")
        self.assertEqual(dishes[1].metrics.creator_count, 1)
        self.assertEqual(dishes[0].metrics.creator_count, 2)

    def test_local_mention_count(self):
        cluster = Cluster(
            id="birria",
            name="Birria Tacos",
            posts=[
                _post(id="n1", location="A", scope="national"),
                _post(id="l1", location="B", scope="local"),
            ],
            why_trending=WhyTrending(summary="local"),
        )
        dishes = score_all(
            [cluster],
            7,
            {"output": {"min_mentions": 2, "max_dishes": 5}, "scoring": {"weights": {"reach": 1}}},
        )
        self.assertEqual(dishes[0].metrics.local_mention_count, 1)


class LocationTests(unittest.TestCase):
    def test_houston_default_dma(self):
        loc = resolve_location({"location": {"city": "Houston"}})
        self.assertEqual(loc["trends_geo"], "US-TX-618")
        self.assertEqual(loc["trends_geo_region"], "US-TX")
        self.assertEqual(loc["state"], "TX")

    def test_neighborhood_survives_city_lookup(self):
        loc = resolve_location({"location": {"city": "Austin"}}, neighborhood="East Austin")
        self.assertEqual(loc["neighborhood"], "East Austin")
        self.assertEqual(loc["trends_geo"], "US-TX-635")

    def test_city_override_chicago(self):
        loc = resolve_location(
            {"location": {"city": "Houston", "trends_geo": "US-TX-618", "state": "TX"}},
            city="Chicago",
        )
        self.assertEqual(loc["city"], "Chicago")
        self.assertEqual(loc["trends_geo"], "US-IL-602")
        self.assertEqual(loc["state"], "IL")
        self.assertEqual(loc["county"], "Cook County")
        self.assertEqual(geo_point(loc), (41.8954, -87.6243))

    def test_heights_pin_beats_downtown(self):
        loc = resolve_location({"location": {"city": "Houston"}}, neighborhood="The Heights")
        self.assertEqual(geo_point(loc), (29.7990, -95.3984))
        self.assertIn("Harris", loc["county"])


class LocalPackTests(unittest.TestCase):
    def test_parse_review_age(self):
        now = datetime(2026, 9, 12, tzinfo=timezone.utc)
        three = parse_review_age("3 days ago", now=now)
        self.assertEqual((now - three).days, 3)
        week = parse_review_age("a week ago", now=now)
        self.assertEqual((now - week).days, 7)
        self.assertIsNone(parse_review_age("visited in 2019"))

    def test_spike_needs_several_restaurants(self):
        now = datetime.now(timezone.utc)
        reviews = [
            {"restaurant": "A", "text": "The hot honey smash burger was perfect", "created_at": now - timedelta(days=2)},
            {"restaurant": "B", "text": "Get the hot honey smash burger", "created_at": now - timedelta(days=4)},
            {"restaurant": "C", "text": "hot honey smash burger special tonight", "created_at": now - timedelta(days=5)},
            {"restaurant": "D", "text": "Came for the hot honey smash burger", "created_at": now - timedelta(days=6)},
            {"restaurant": "E", "text": "Service was slow", "created_at": now - timedelta(days=1)},
        ]
        spikes = detect_spikes(reviews, min_restaurants=4, window_days=14, now=now)
        phrases = [s.phrase for s in spikes]
        self.assertTrue(any("hot honey smash burger" in p for p in phrases))
        self.assertTrue(all(s.restaurant_count >= 4 for s in spikes))
        self.assertFalse(any("service" in s.phrase for s in spikes))

    def test_unknown_plates_do_not_need_a_cue_list(self):
        now = datetime.now(timezone.utc)
        reviews = [
            {"restaurant": name, "text": "The corn ribs were insane", "created_at": now - timedelta(days=1)}
            for name in ("A", "B", "C")
        ]
        spikes = detect_spikes(reviews, min_restaurants=3, window_days=14, now=now)
        self.assertTrue(any("corn ribs" in s.phrase for s in spikes))

    def test_old_reviews_do_not_spike(self):
        now = datetime.now(timezone.utc)
        reviews = [
            {
                "restaurant": name,
                "text": "The birria ramen is everything",
                "created_at": now - timedelta(days=40),
            }
            for name in ("A", "B", "C", "D", "E")
        ]
        self.assertEqual(detect_spikes(reviews, min_restaurants=4, window_days=14, now=now), [])


class MapsParseTests(unittest.TestCase):
    def test_parse_reads_local_reviews(self):
        connector = GoogleMapsConnector({
            "review_window_days": 14,
            "min_restaurants_for_spike": 4,
        })
        raw = [
            {
                "name": "Tiny Champion",
                "url": "https://www.google.com/maps/place/Tiny+Champion",
                "review_count": 842,
                "is_new": False,
                "reviews": [
                    {"text": "Came back for the hot honey smash burger.", "relative_time": "3 days ago"},
                ],
            },
            {
                "name": "Better Luck Tomorrow",
                "url": "https://www.google.com/maps/place/Better+Luck+Tomorrow",
                "review_count": 1204,
                "is_new": False,
                "reviews": [
                    {"text": "Everyone at the bar was eating the hot honey smash burger.", "relative_time": "2 days ago"},
                ],
            },
            {
                "name": "Pinkerton's Barbecue",
                "url": "https://www.google.com/maps/place/Pinkertons+Barbecue",
                "review_count": 3102,
                "is_new": False,
                "reviews": [
                    {"text": "They put a hot honey smash burger on the lunch board.", "relative_time": "5 days ago"},
                ],
            },
            {
                "name": "Moonshine Patio",
                "url": "https://www.google.com/maps/place/Moonshine+Patio",
                "review_count": 210,
                "is_new": True,
                "reviews": [
                    {"text": "The hot honey smash burger with pickles is why we came.", "relative_time": "1 day ago"},
                ],
            },
            {
                "name": "Street to Kitchen",
                "url": "https://www.google.com/maps/place/Street+to+Kitchen",
                "review_count": 1540,
                "is_new": False,
                "reviews": [
                    {"text": "Hot honey smash burger is not on the printed menu but they will make it.", "relative_time": "9 days ago"},
                ],
            },
            {
                "name": "Truth BBQ",
                "url": "https://www.google.com/maps/place/Truth+BBQ",
                "review_count": 4200,
                "is_new": False,
                "reviews": [
                    {"text": "Brisket was perfect. No new dishes, just the usual.", "relative_time": "2 days ago"},
                ],
            },
        ]
        posts = connector.parse(raw)
        self.assertGreaterEqual(len(posts), 6)
        self.assertTrue(all(p.scope == "local" for p in posts))
        self.assertTrue(all(p.source == "google_maps" for p in posts))
        restaurants = {p.location for p in posts}
        self.assertIn("Tiny Champion", restaurants)
        spiked = [p for p in posts if p.trend_marker and "hot honey" in p.text.lower()]
        self.assertGreaterEqual(len(spiked), 1)


class ExtractSelectTests(unittest.TestCase):
    def test_select_keeps_maps_when_youtube_is_huge(self):
        youtube = [
            _post(id=f"yt{i}", source="youtube", engagement=100_000 + i, scope="national")
            for i in range(40)
        ]
        maps = [
            _post(
                id=f"m{i}",
                source="google_maps",
                scope="local",
                location=f"Place {i}",
                engagement=12,
            )
            for i in range(8)
        ]
        selected = select_for_extract(
            youtube + maps,
            {"max_posts": 20, "source_floors": {"google_maps": 8}, "scope_floors": {"local": 8}},
        )
        maps_kept = [p for p in selected if p.source == "google_maps"]
        self.assertEqual(len(selected), 20)
        self.assertEqual(len(maps_kept), 8)


class MapsScoreTests(unittest.TestCase):
    def test_maps_only_spike_is_rising_and_not_crushed(self):
        places = ["Tiny Champion", "Better Luck Tomorrow", "Pinkerton's", "Moonshine Patio"]
        cluster = Cluster(
            id="hot-honey-smash-burger",
            name="Hot Honey Smash Burger",
            posts=[
                _post(
                    id=f"r{i}",
                    source="google_maps",
                    scope="local",
                    location=place,
                    text=f"{place}: the hot honey smash burger",
                    engagement=200,
                )
                for i, place in enumerate(places)
            ],
            why_trending=WhyTrending(summary="local spike"),
        )
        filler = Cluster(
            id="national-pasta",
            name="Weeknight Pasta",
            posts=[
                _post(id="n1", location="Lynja", engagement=80_000, breakout_ratio=1.1, source="youtube"),
                _post(id="n2", location="QCP", engagement=40_000, breakout_ratio=0.9, source="youtube"),
            ],
            why_trending=WhyTrending(summary="national"),
        )
        dishes = score_all(
            [cluster, filler],
            14,
            {
                "output": {"min_mentions": 2, "max_dishes": 10},
                "scoring": {
                    "rising_local_restaurants": 4,
                    "weights": {
                        "reach": 0.18,
                        "virality": 0.26,
                        "velocity": 0.16,
                        "volume": 0.10,
                        "breadth": 0.08,
                        "recency": 0.07,
                        "local": 0.08,
                        "local_spike": 0.07,
                    },
                },
            },
        )
        local = next(d for d in dishes if d.id == "hot-honey-smash-burger")
        self.assertEqual(local.metrics.local_restaurant_count, 4)
        self.assertEqual(local.momentum, "rising")
        self.assertGreater(local.trend_score, 0)


class DesireTests(unittest.TestCase):
    def test_extracts_i_want_and_skips_praise(self):
        from ingestion.desires import extract_ask, extract_asks

        hit = extract_ask("I want this as a late-night slider, not a whole sandwich")
        self.assertIsNotNone(hit)
        self.assertIn("slider", hit["ask"].lower())
        self.assertIsNone(extract_ask("Looks insane. Going this weekend."))
        asks = extract_asks([
            "Please make this with leftover brisket",
            "Looks insane. Going this weekend.",
            "Please make this with leftover brisket",
        ])
        self.assertEqual(len(asks), 1)


class QueryBuilderTests(unittest.TestCase):
    def test_kitchen_fills_queries_not_a_dish_list(self):
        pairs = build_discovery_queries(city="Chicago", cuisine="ramen")
        queries = [query for query, _scope in pairs]
        self.assertTrue(any("ramen" in query for query in queries))
        self.assertTrue(any("Chicago" in query for query in queries))
        self.assertFalse(any("dubai chocolate" in query.lower() for query in queries))
        self.assertFalse(any("nickdigiovanni" in query.lower() for query in queries))

    def test_different_kitchens_search_different_things(self):
        ramen = [q for q, _ in build_discovery_queries(city="Chicago", cuisine="ramen")]
        bbq = [q for q, _ in build_discovery_queries(city="Houston", cuisine="BBQ")]
        self.assertNotEqual(ramen, bbq)
        self.assertTrue(any("BBQ" in query or "bbq" in query.lower() for query in bbq))

    def test_no_kitchen_falls_back_to_generic(self):
        pairs = build_discovery_queries()
        self.assertGreaterEqual(len(pairs), 1)
        self.assertTrue(all(scope == "national" for _query, scope in pairs))


if __name__ == "__main__":
    unittest.main()
