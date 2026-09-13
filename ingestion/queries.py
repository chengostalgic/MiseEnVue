"""Kitchen-driven search strings.

Discover is not a channel roster and not a list of dishes we already like.
Queries are filled from this kitchen (city, cuisine, neighborhood) plus
whatever Google Trends is rising right now. A ramen shop in Chicago and a
BBQ spot in Houston therefore search different things.
"""

from __future__ import annotations

MAX_QUERIES = 8


def build_discovery_queries(
    *,
    city: str | None = None,
    cuisine: str | None = None,
    neighborhood: str | None = None,
    region: str | None = None,
    rising_terms: list[str] | None = None,
    limit: int = MAX_QUERIES,
) -> list[tuple[str, str]]:
    """Return (query, scope) pairs for YouTube search.

    Scope is local / regional / national. No dish names are hardcoded.
    """
    city = _clean(city)
    cuisine = _clean(cuisine)
    neighborhood = _clean(neighborhood)
    region = _clean(region)

    out: list[tuple[str, str]] = []
    if cuisine:
        out.extend(
            [
                (f"{cuisine} everyone is making", "national"),
                (f"i tried the viral {cuisine}", "national"),
                (f"{cuisine} restaurant special", "national"),
            ]
        )
    if city:
        out.append((f"{city} viral food", "local"))
        out.append((f"{city} must try food", "local"))
        if cuisine:
            out.append((f"{city} {cuisine} must try", "local"))
    if neighborhood and city:
        out.append((f"{neighborhood} {city} food", "local"))
    if region:
        out.append((f"{region} food trend", "regional"))
    for term in rising_terms or []:
        blob = _clean(term)
        if not blob:
            continue
        query = blob if "recipe" in blob.lower() or "food" in blob.lower() else f"{blob} recipe"
        out.append((query, "national"))

    if not out:
        out = [
            ("i tried the viral", "national"),
            ("everyone is making this", "national"),
            ("tiktok recipe", "national"),
        ]

    return _dedupe(out)[: max(1, limit)]


def query_strings(pairs: list[tuple[str, str]]) -> list[str]:
    return [query for query, _scope in pairs]


def _clean(value: str | None) -> str:
    if not value:
        return ""
    text = " ".join(value.split()).strip()
    if text.lower() in {"n/a", "na", "none", "null", "-"}:
        return ""
    return text


def _dedupe(pairs: list[tuple[str, str]]) -> list[tuple[str, str]]:
    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    for query, scope in pairs:
        key = query.lower()
        if not query or key in seen:
            continue
        seen.add(key)
        out.append((query, scope))
    return out
