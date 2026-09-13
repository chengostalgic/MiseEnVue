"""Resolve the restaurant's market into query templates, Trends geos, and GPS.

The pipeline used to be national-only after local YouTube volume looked too
thin to rank against food-media channels. That was the wrong lesson: local
posts are a different signal, not a worse one, and they have to be collected
and scored on their own tier. This module is the single place that turns a
city name into the strings every connector needs.

Lat/lon are county-seat (or downtown) coordinates used to spoof browser
geolocation. Google Search and Maps honor GPS over IP, so a Houston run
must actually look like a phone sitting in Harris County.
"""

from __future__ import annotations

from typing import Any

# Google Trends metro DMA codes. City-in-query is what YouTube understands;
# DMA geo is what Trends understands; lat/lon is what Maps honors.
# Coordinates are the county seat / downtown point, not a random IP.
MARKETS: dict[str, dict[str, Any]] = {
    "houston": {
        "city": "Houston",
        "county": "Harris County",
        "region_name": "Texas",
        "state": "TX",
        "latitude": 29.7604,
        "longitude": -95.3698,
        "timezone": "America/Chicago",
        "trends_geo": "US-TX-618",
        "trends_geo_region": "US-TX",
    },
    "austin": {
        "city": "Austin",
        "county": "Travis County",
        "region_name": "Texas",
        "state": "TX",
        "latitude": 30.2672,
        "longitude": -97.7431,
        "timezone": "America/Chicago",
        "trends_geo": "US-TX-635",
        "trends_geo_region": "US-TX",
    },
    "dallas": {
        "city": "Dallas",
        "county": "Dallas County",
        "region_name": "Texas",
        "state": "TX",
        "latitude": 32.7767,
        "longitude": -96.7970,
        "timezone": "America/Chicago",
        "trends_geo": "US-TX-623",
        "trends_geo_region": "US-TX",
    },
    "chicago": {
        "city": "Chicago",
        "county": "Cook County",
        "region_name": "Illinois",
        "state": "IL",
        "latitude": 41.8954,
        "longitude": -87.6243,
        "timezone": "America/Chicago",
        "trends_geo": "US-IL-602",
        "trends_geo_region": "US-IL",
    },
    "new york": {
        "city": "New York",
        "county": "New York County",
        "region_name": "New York",
        "state": "NY",
        "latitude": 40.7128,
        "longitude": -74.0060,
        "timezone": "America/New_York",
        "trends_geo": "US-NY-501",
        "trends_geo_region": "US-NY",
    },
    "nyc": {
        "city": "New York",
        "county": "New York County",
        "region_name": "New York",
        "state": "NY",
        "latitude": 40.7128,
        "longitude": -74.0060,
        "timezone": "America/New_York",
        "trends_geo": "US-NY-501",
        "trends_geo_region": "US-NY",
    },
    "los angeles": {
        "city": "Los Angeles",
        "county": "Los Angeles County",
        "region_name": "California",
        "state": "CA",
        "latitude": 34.0522,
        "longitude": -118.2437,
        "timezone": "America/Los_Angeles",
        "trends_geo": "US-CA-803",
        "trends_geo_region": "US-CA",
    },
    "la": {
        "city": "Los Angeles",
        "county": "Los Angeles County",
        "region_name": "California",
        "state": "CA",
        "latitude": 34.0522,
        "longitude": -118.2437,
        "timezone": "America/Los_Angeles",
        "trends_geo": "US-CA-803",
        "trends_geo_region": "US-CA",
    },
    "san francisco": {
        "city": "San Francisco",
        "county": "San Francisco County",
        "region_name": "California",
        "state": "CA",
        "latitude": 37.7749,
        "longitude": -122.4194,
        "timezone": "America/Los_Angeles",
        "trends_geo": "US-CA-807",
        "trends_geo_region": "US-CA",
    },
    "seattle": {
        "city": "Seattle",
        "county": "King County",
        "region_name": "Washington",
        "state": "WA",
        "latitude": 47.6062,
        "longitude": -122.3321,
        "timezone": "America/Los_Angeles",
        "trends_geo": "US-WA-819",
        "trends_geo_region": "US-WA",
    },
    "miami": {
        "city": "Miami",
        "county": "Miami-Dade County",
        "region_name": "Florida",
        "state": "FL",
        "latitude": 25.7617,
        "longitude": -80.1918,
        "timezone": "America/New_York",
        "trends_geo": "US-FL-528",
        "trends_geo_region": "US-FL",
    },
    "atlanta": {
        "city": "Atlanta",
        "county": "Fulton County",
        "region_name": "Georgia",
        "state": "GA",
        "latitude": 33.7490,
        "longitude": -84.3880,
        "timezone": "America/New_York",
        "trends_geo": "US-GA-524",
        "trends_geo_region": "US-GA",
    },
    "denver": {
        "city": "Denver",
        "county": "Denver County",
        "region_name": "Colorado",
        "state": "CO",
        "latitude": 39.7392,
        "longitude": -104.9903,
        "timezone": "America/Denver",
        "trends_geo": "US-CO-751",
        "trends_geo_region": "US-CO",
    },
    "phoenix": {
        "city": "Phoenix",
        "county": "Maricopa County",
        "region_name": "Arizona",
        "state": "AZ",
        "latitude": 33.4484,
        "longitude": -112.0740,
        "timezone": "America/Phoenix",
        "trends_geo": "US-AZ-753",
        "trends_geo_region": "US-AZ",
    },
}

# Neighborhood pins beat the county seat when the restaurant named one.
# Google will otherwise serve downtown results for a Heights kitchen.
NEIGHBORHOODS: dict[tuple[str, str], tuple[float, float]] = {
    ("houston", "the heights"): (29.7990, -95.3984),
    ("houston", "montrose"): (29.7420, -95.3920),
    ("austin", "east austin"): (30.2630, -97.7140),
    ("chicago", "west loop"): (41.8826, -87.6446),
    ("chicago", "wicker park"): (41.9088, -87.6796),
    ("new york", "williamsburg"): (40.7081, -73.9571),
    ("los angeles", "silver lake"): (34.0869, -118.2702),
}

STATE_GEO = {
    "TX": "US-TX",
    "IL": "US-IL",
    "NY": "US-NY",
    "CA": "US-CA",
    "WA": "US-WA",
    "FL": "US-FL",
    "GA": "US-GA",
    "CO": "US-CO",
    "AZ": "US-AZ",
}


def resolve_location(
    config: dict[str, Any],
    city: str | None = None,
    region: str | None = None,
    state: str | None = None,
    neighborhood: str | None = None,
    county: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
) -> dict[str, Any]:
    """Merge config.location with CLI/API overrides and fill in Trends geos."""
    loc = {k: v for k, v in (config.get("location") or {}).items() if v not in (None, "")}
    if neighborhood:
        loc["neighborhood"] = neighborhood
    if city:
        loc["city"] = city
        # A city switch has to replace the previous market's DMA and pin,
        # not keep Houston's geo under a Chicago label.
        known = MARKETS.get(city.strip().lower())
        if known:
            loc.update(known)
    if region:
        loc["region_name"] = region
    if state:
        loc["state"] = state.upper()
    if county:
        loc["county"] = county

    known = MARKETS.get((loc.get("city") or "").strip().lower())
    if known:
        for key, value in known.items():
            loc.setdefault(key, value)

    _apply_neighborhood_pin(loc)

    if latitude is not None:
        loc["latitude"] = float(latitude)
    if longitude is not None:
        loc["longitude"] = float(longitude)

    loc["latitude"] = _as_float(loc.get("latitude"))
    loc["longitude"] = _as_float(loc.get("longitude"))

    state_code = (loc.get("state") or "").upper()
    if state_code and "trends_geo_region" not in loc:
        geo = STATE_GEO.get(state_code)
        if geo:
            loc["trends_geo_region"] = geo
    loc.setdefault("region_code", "US")
    loc.setdefault("timezone", "America/Chicago")
    if loc.get("city") and loc.get("state") and not loc.get("county"):
        loc["county"] = f"{loc['city']} County"
    return loc


def geo_point(loc: dict[str, Any]) -> tuple[float, float] | None:
    """Return (lat, lon) when both are present and usable."""
    lat = _as_float(loc.get("latitude"))
    lon = _as_float(loc.get("longitude"))
    if lat is None or lon is None:
        return None
    return lat, lon


def market_label(loc: dict[str, Any]) -> str:
    city = loc.get("city")
    state = loc.get("state")
    neighborhood = loc.get("neighborhood")
    county = loc.get("county")
    place = f"{neighborhood}, {city}" if neighborhood and city else city
    if place and state:
        label = f"{place}, {state}"
    else:
        label = place or loc.get("region_name") or loc.get("region_code") or "US"
    if county and county not in str(label):
        return f"{label} ({county})"
    return label


def _apply_neighborhood_pin(loc: dict[str, Any]) -> None:
    city = (loc.get("city") or "").strip().lower()
    neighborhood = (loc.get("neighborhood") or "").strip().lower()
    if not city or not neighborhood:
        return
    pin = NEIGHBORHOODS.get((city, neighborhood))
    if pin:
        loc["latitude"], loc["longitude"] = pin


def _as_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
