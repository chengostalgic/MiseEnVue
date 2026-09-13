"""Pipeline entrypoint.

    python -m ingestion.pipeline                 # live pull, 7-day window
    python -m ingestion.pipeline --since 14      # wider window
    python -m ingestion.pipeline --offline       # replay last cached pull, no network
    python -m ingestion.pipeline --dry-run       # print, don't overwrite trends.json

Writes data/out/trends.json -- the Part 1 -> Part 2 contract.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml

from ingestion.connectors.maps import GoogleMapsConnector
from ingestion.connectors.youtube import YouTubeConnector
from ingestion.extract import extract
from ingestion.location import market_label, resolve_location
from ingestion.normalize import dedupe, normalize, within_window
from ingestion.queries import build_discovery_queries
from ingestion.schema import build_output
from ingestion.score import score_all
from ingestion.trends import discover_rising_terms, fetch_velocity

CONFIG_PATH = Path("ingestion/config.yaml")
OUT_PATH = Path("data/out/trends.json")
ENV_PATH = Path(".env")

# Add connectors here as they land. Order is display order only.
# Maps is after YouTube so a browser scrape failure cannot starve the
# channel pull — each connector is isolated in fetch().
CONNECTORS = [YouTubeConnector, GoogleMapsConnector]


def load_env(path: Path = ENV_PATH) -> None:
    """Read KEY=value lines from .env into os.environ.

    Hand-rolled rather than pulling in python-dotenv for six lines. Existing
    environment variables win, so an inline override still works.
    """
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def _is_hand_written(path: Path) -> bool:
    """True if path holds the hand-authored contract sample rather than output."""
    if not path.is_file():
        return False
    try:
        return bool(json.loads(path.read_text()).get("_meta", {}).get("hand_written"))
    except (json.JSONDecodeError, OSError):
        return False


def run(
    since_days: int,
    offline: bool,
    dry_run: bool,
    force: bool = False,
    city: str | None = None,
    region: str | None = None,
    state: str | None = None,
    neighborhood: str | None = None,
    county: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    cuisine: str | None = None,
) -> int:
    load_env()
    config = yaml.safe_load(CONFIG_PATH.read_text())
    loc = resolve_location(
        config,
        city=city,
        region=region,
        state=state,
        neighborhood=neighborhood,
        county=county,
        latitude=latitude,
        longitude=longitude,
    )
    if cuisine:
        loc["cuisine"] = cuisine
    config["location"] = loc

    print(f"Window: {since_days}d | offline: {offline} | market: {market_label(loc)}"
          f"{f' | cuisine: {cuisine}' if cuisine else ''}")

    rising = discover_rising_terms(config, offline=offline)
    discovery_queries = build_discovery_queries(
        city=loc.get("city"),
        cuisine=cuisine or loc.get("cuisine"),
        neighborhood=loc.get("neighborhood"),
        region=loc.get("region_name"),
        rising_terms=rising,
    )
    print("  [queries] " + ", ".join(query for query, _scope in discovery_queries))

    posts = []
    sources_used = []
    if rising:
        sources_used.append("google_trends")
    for cls in CONNECTORS:
        # Location is global config, not per-connector, but connectors need it.
        cfg = {**config.get(cls.name, {}), **loc}
        cfg["discovery_queries"] = discovery_queries
        cfg["seed_queries"] = [query for query, _scope in discovery_queries]
        if cuisine:
            cfg.setdefault("food_types", [cuisine])
        connector = cls(cfg)
        fetched = connector.fetch(since_days, offline=offline)
        if fetched:
            sources_used.append(cls.name)
            posts.extend(fetched)
        print(f"  [{cls.name}] {len(fetched)} posts")

    if not posts:
        print("\nNo posts from any source. Nothing to write.", file=sys.stderr)
        return 1

    # Channel pulls deliberately reach further back than --since: channels
    # publish weekly, so a 14-day window caps out at ~6 videos each, and
    # looking further back costs no extra quota on that path. Filtering to
    # --since afterwards would undo that -- it discarded 128 of 316 videos
    # before this was caught. The effective window is the widest any connector
    # was asked for.
    effective_window = max(
        since_days,
        config.get("youtube", {}).get("channel_window_days", since_days),
    )
    posts = within_window(dedupe(posts), effective_window)
    if effective_window != since_days:
        print(f"  [window] keeping {effective_window}d (channel pulls reach back further)")
    # viral_only is applied here, not in the connector. The connector's
    # version only ran on live fetches -- --offline replays the cache straight
    # into parse() and skipped it, so the same corpus produced different
    # results depending on the flag. Filtering post-parse makes the two paths
    # agree, and it is a policy decision rather than a fetch concern anyway.
    if config.get("youtube", {}).get("virality", {}).get("viral_only", False):
        before = len(posts)
        posts = [p for p in posts if p.is_viral]
        print(f"  [viral_only] {len(posts)}/{before} posts cleared the virality bar")

    posts = normalize(posts)
    print(f"\n{len(posts)} posts after dedupe + window filter")

    clusters = extract(posts, config)
    print(f"{len(clusters)} dish clusters")

    # Trends runs after extraction because it scores dish names, not posts.
    # Only the clusters big enough to survive ranking are worth querying --
    # each term costs a rate-limited request.
    ranked = sorted(clusters, key=lambda c: len(c.posts), reverse=True)
    terms = [c.name for c in ranked[: config.get("output", {}).get("max_dishes", 20)]]
    velocities = fetch_velocity(terms, config, offline=offline)
    if velocities:
        if "google_trends" not in sources_used:
            sources_used.append("google_trends")
        computable = sum(1 for v in velocities.values() if v.computable)
        print(f"  [trends] velocity for {computable}/{len(terms)} dishes")

    dishes = score_all(clusters, since_days, config, velocities)
    print(f"{len(dishes)} dishes after ranking\n")

    now = datetime.now(timezone.utc)
    output = build_output(
        dishes=dishes,
        window_days=since_days,
        window_start=now - timedelta(days=since_days),
        window_end=now,
        sources_used=sources_used,
        fixture=offline,
        market=loc,
    )

    for d in output["dishes"]:
        s = d["metrics"]["sentiment"]
        print(
            f"  {d['trend_score']:5.1f}  {d['name'][:40]:42} "
            f"{d['metrics']['mention_count']:4} mentions  {s['positive']:.0%} pos"
            f"  {d['momentum']}"
        )

    if dry_run:
        print("\n--dry-run: not writing.")
        return 0

    if _is_hand_written(OUT_PATH) and not force:
        print(
            f"\nRefusing to overwrite {OUT_PATH}: it is the hand-written contract\n"
            "the rest of the team is building against, and the pipeline is not\n"
            "good enough to replace it yet. Re-run with --force when it is.",
            file=sys.stderr,
        )
        return 1

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(output, indent=2) + "\n")
    print(f"\nWrote {OUT_PATH}")
    from ingestion.signal_lab import write_signal_lab

    write_signal_lab()
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="MiseEnVue trend ingestion")
    ap.add_argument("--since", type=int, default=7, help="window in days (default 7)")
    ap.add_argument(
        "--offline",
        action="store_true",
        help="replay the last cached pull instead of hitting the network",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="print results without overwriting trends.json",
    )
    ap.add_argument(
        "--force",
        action="store_true",
        help="allow overwriting the hand-written contract sample",
    )
    ap.add_argument("--city", help="restaurant city (e.g. Houston, Chicago). Sets local YouTube queries, Trends DMA, and Maps pin.")
    ap.add_argument("--neighborhood", help="finer than city (e.g. East Austin, Williamsburg). Overrides the county-seat pin when known.")
    ap.add_argument("--region", help="state or region name used in regional YouTube queries")
    ap.add_argument("--state", help="two-letter state code (e.g. TX, IL)")
    ap.add_argument("--county", help="county name for Maps queries (e.g. Harris County)")
    ap.add_argument("--lat", type=float, dest="latitude", help="override Maps geolocation latitude")
    ap.add_argument("--lon", type=float, dest="longitude", help="override Maps geolocation longitude")
    ap.add_argument("--cuisine", help="kitchen cuisine — drives search instead of a fixed dish list")
    args = ap.parse_args()
    return run(
        args.since, args.offline, args.dry_run, args.force,
        city=args.city, region=args.region, state=args.state,
        neighborhood=args.neighborhood, county=args.county,
        latitude=args.latitude, longitude=args.longitude,
        cuisine=args.cuisine,
    )


if __name__ == "__main__":
    raise SystemExit(main())
