"""Google Trends velocity enrichment.

Not a connector. Connectors discover posts; this scores dish names that
extraction already found, so it runs after extraction rather than alongside
the connectors. No auth required.

WHY VELOCITY AND NOT INTEREST
Google Trends normalizes its 0-100 interest values *within a single query
batch*. A dish scoring 80 in one batch of five terms and a dish scoring 40 in
another batch are not comparable -- the scale is re-derived per request. So
absolute interest is unusable for ranking dishes against each other.

Velocity is. It is a ratio computed inside one term's own series (second half
of the window vs first half), so the normalization cancels out and the number
means the same thing for every dish. That is the only Trends figure this
module exposes for cross-dish comparison.

Each dish is queried twice -- nationally and at the client's DMA -- because the
gap is the interesting part: rising nationally but flat locally means the trend
has not reached this market yet, which is either the opening or the warning.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

CACHE_DIR = Path("data/raw/google_trends")
BATCH_SIZE = 5  # Google's per-request term limit


@dataclass
class Velocity:
    """One dish's search trajectory."""

    term: str
    national_pct: float | None = None  # change vs first half of window
    regional_pct: float | None = None
    local_pct: float | None = None
    # Which tier momentum was actually read from, after falling back outward.
    momentum_basis: str = "none"
    momentum: str = "steady"  # rising | steady | fading
    local_rising_queries: list[str] = field(default_factory=list)
    computable: bool = False
    # True when the percentage came from a zero baseline. A term nobody
    # searched for last week that gets searched once this week posts a huge
    # percentage off essentially no data -- real signal, but weak, and without
    # this flag it would outrank a dish genuinely climbing from real volume.
    low_confidence: bool = False


def fetch_velocity(
    terms: list[str], config: dict[str, Any], offline: bool = False
) -> dict[str, Velocity]:
    """Velocity per term, national and local. Never raises."""
    if not terms:
        return {}

    cfg = config.get("google_trends", {})
    loc = config.get("location", {})
    geo_local = ""
    geo_region = ""
    timeframe = cfg.get("timeframe", "now 7-d")

    cached = _load_cache() if offline else None
    if cached is not None:
        print(f"  [trends] replaying {len(cached)} cached terms")
        return {t: _from_dict(d) for t, d in cached.items() if t in set(terms)}

    try:
        from pytrends.request import TrendReq
    except ImportError:
        print("  [trends] pytrends not installed; skipping velocity")
        return {}

    results: dict[str, Velocity] = {t: Velocity(term=t) for t in terms}
    pytrends = TrendReq(hl="en-US", tz=360)
    # pytrends is an unofficial client and Google throttles it hard. Once it
    # starts returning 429s it generally keeps doing so for the rest of the
    # session, so a shared circuit breaker stops us burning minutes on retries
    # that will not succeed. Velocity is optional -- dishes still rank on reach
    # and volume without it.
    state = {"tripped": False}

    for start in range(0, len(terms), BATCH_SIZE):
        batch = terms[start : start + BATCH_SIZE]
        if state["tripped"]:
            break
        national = _series(pytrends, batch, timeframe, "US", cfg, state)
        regional = _series(pytrends, batch, timeframe, geo_region, cfg, state) if geo_region else {}
        local = _series(pytrends, batch, timeframe, geo_local, cfg, state) if geo_local else {}

        for term in batch:
            v = results[term]
            v.national_pct, nat_weak = _change(national.get(term))
            v.regional_pct, reg_weak = _change(regional.get(term))
            v.local_pct, loc_weak = _change(local.get(term))
            v.computable = any(
                p is not None for p in (v.national_pct, v.regional_pct, v.national_pct)
            ) or v.local_pct is not None
            basis, pct, weak = _basis(v, nat_weak, reg_weak, loc_weak)
            v.momentum_basis, v.low_confidence = basis, weak
            v.momentum = _momentum(pct, cfg)

    # Rising local queries are discovery, not scoring -- they surface what this
    # specific market is searching for around the dish, which is campaign
    # material for Part 3 rather than a ranking input.
    if geo_local and cfg.get("fetch_rising", True) and not state["tripped"]:
        _attach_rising(pytrends, results, timeframe, geo_local, cfg)

    # Only cache a pull that actually produced something -- caching an
    # all-empty result would poison every subsequent --offline run.
    if any(v.computable for v in results.values()):
        _write_cache(results)
    return results


def _series(
    pytrends, batch: list[str], timeframe: str, geo: str, cfg: dict, state: dict
) -> dict[str, list[float]]:
    """interest_over_time for one batch, with backoff.

    Google rate-limits pytrends aggressively and a 429 mid-run would otherwise
    lose the whole batch. A failed batch returns empty rather than raising --
    a dish with no velocity still ranks on volume.
    """
    delay = cfg.get("retry_delay_seconds", 3)
    for attempt in range(cfg.get("max_retries", 3)):
        try:
            pytrends.build_payload(batch, timeframe=timeframe, geo=geo)
            frame = pytrends.interest_over_time()
            if frame is None or frame.empty:
                return {}
            return {
                term: frame[term].tolist() for term in batch if term in frame.columns
            }
        except Exception as exc:  # noqa: BLE001 - rate limits are the common case
            if "TooManyRequests" in type(exc).__name__ or "429" in str(exc):
                state["rate_limited"] = state.get("rate_limited", 0) + 1
                if state["rate_limited"] >= cfg.get("give_up_after_429s", 3):
                    state["tripped"] = True
                    print(
                        "  [trends] rate limited by Google; skipping velocity for "
                        "the rest of this run. Dishes still rank on reach and "
                        "volume. Re-run later or use --offline to replay a good pull."
                    )
                    return {}
            if attempt == cfg.get("max_retries", 3) - 1:
                print(f"  [trends] batch failed for geo={geo or 'US'} ({type(exc).__name__})")
                return {}
            time.sleep(delay * (attempt + 1))
    return {}


def _change(series: list[float] | None) -> tuple[float | None, bool]:
    """Percent change between the two halves of the window.

    Returns (percent, low_confidence). A ratio within one term's own series, so
    Google's per-batch normalization cancels and the result is comparable
    across dishes.
    """
    if not series or len(series) < 4:
        return None, False
    mid = len(series) // 2
    first = sum(series[:mid]) / mid
    second = sum(series[mid:]) / (len(series) - mid)
    if first <= 0:
        # No baseline to divide by. Any late interest is real but weakly
        # evidenced, so it is reported as rising and flagged low-confidence.
        # A flat-zero series is unknown rather than 0% change -- "nobody
        # searched for this at all" is not "interest held steady".
        return (100.0, True) if second > 0 else (None, False)
    return round((second - first) / first * 100, 1), False


def _basis(
    v: Velocity, nat_weak: bool, reg_weak: bool, loc_weak: bool
) -> tuple[str, float | None, bool]:
    """Pick the narrowest tier with usable data, falling back outward.

    Metro is the most decision-relevant tier but is frequently empty -- a real
    regional trend can have no measurable DMA search volume at all. Rather than
    reporting "steady" because the narrowest tier happened to be silent, walk
    outward: metro -> state -> national. A metro reading built on a zero
    baseline is weaker evidence than a solid state reading, so it is skipped
    too rather than trusted just for being local.
    """
    for name, pct, weak in (
        ("local", v.local_pct, loc_weak),
        ("regional", v.regional_pct, reg_weak),
        ("national", v.national_pct, nat_weak),
    ):
        if pct is not None and not weak:
            return name, pct, False
    # Nothing solid at any tier; accept the narrowest weak reading if there is
    # one, flagged so scoring damps it.
    for name, pct, weak in (
        ("local", v.local_pct, loc_weak),
        ("regional", v.regional_pct, reg_weak),
        ("national", v.national_pct, nat_weak),
    ):
        if pct is not None:
            return name, pct, weak
    return "none", None, False


def _momentum(pct: float | None, cfg: dict) -> str:
    rising = cfg.get("rising_threshold_pct", 15)
    fading = cfg.get("fading_threshold_pct", -15)
    if pct is None:
        return "steady"
    if pct >= rising:
        return "rising"
    if pct <= fading:
        return "fading"
    return "steady"


def _attach_rising(pytrends, results: dict[str, Velocity], timeframe, geo, cfg) -> None:
    for term, v in results.items():
        try:
            pytrends.build_payload([term], timeframe=timeframe, geo=geo)
            rising = pytrends.related_queries().get(term, {}).get("rising")
            if rising is not None and len(rising):
                v.local_rising_queries = rising["query"].head(4).tolist()
        except Exception:  # noqa: BLE001 - nice to have, never load-bearing
            continue


# --------------------------------------------------------------------------
# Cache
# --------------------------------------------------------------------------


def _write_cache(results: dict[str, Velocity]) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    payload = {t: _to_dict(v) for t, v in results.items()}
    (CACHE_DIR / f"{stamp}.json").write_text(json.dumps(payload, indent=2))


def _load_cache() -> dict | None:
    if not CACHE_DIR.is_dir():
        return None
    pulls = sorted(CACHE_DIR.glob("*.json"))
    return json.loads(pulls[-1].read_text()) if pulls else None


def _to_dict(v: Velocity) -> dict:
    return {
        "term": v.term,
        "national_pct": v.national_pct,
        "regional_pct": v.regional_pct,
        "local_pct": v.local_pct,
        "momentum_basis": v.momentum_basis,
        "momentum": v.momentum,
        "local_rising_queries": v.local_rising_queries,
        "computable": v.computable,
        "low_confidence": v.low_confidence,
    }


def _from_dict(d: dict) -> Velocity:
    return Velocity(**d)
