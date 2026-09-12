"""Pipeline entrypoint.

    python -m ingestion.pipeline                 # live pull, 7-day window
    python -m ingestion.pipeline --since 14      # wider window
    python -m ingestion.pipeline --offline       # replay cache/fixtures, no network
    python -m ingestion.pipeline --dry-run       # print, don't overwrite trends.json

Writes data/out/trends.json -- the Part 1 -> Part 2 contract.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml

from ingestion.connectors.youtube import YouTubeConnector
from ingestion.extract import extract
from ingestion.normalize import dedupe, normalize, within_window
from ingestion.schema import build_output
from ingestion.score import score_all

CONFIG_PATH = Path("ingestion/config.yaml")
OUT_PATH = Path("data/out/trends.json")

# Add connectors here as they land. Order is display order only.
CONNECTORS = [YouTubeConnector]


def _is_hand_written(path: Path) -> bool:
    """True if path holds the hand-authored contract sample rather than output."""
    if not path.is_file():
        return False
    try:
        return bool(json.loads(path.read_text()).get("_meta", {}).get("hand_written"))
    except (json.JSONDecodeError, OSError):
        return False


def run(since_days: int, offline: bool, dry_run: bool, force: bool = False) -> int:
    config = yaml.safe_load(CONFIG_PATH.read_text())

    print(f"Window: {since_days}d | offline: {offline}")

    posts = []
    sources_used = []
    for cls in CONNECTORS:
        connector = cls(config.get(cls.name, {}))
        fetched = connector.fetch(since_days, offline=offline)
        if fetched:
            sources_used.append(cls.name)
            posts.extend(fetched)
        print(f"  [{cls.name}] {len(fetched)} posts")

    if not posts:
        print("\nNo posts from any source. Nothing to write.", file=sys.stderr)
        return 1

    posts = within_window(dedupe(posts), since_days)
    posts = normalize(posts)
    print(f"\n{len(posts)} posts after dedupe + window filter")

    clusters = extract(posts, config)
    print(f"{len(clusters)} dish clusters")

    dishes = score_all(clusters, since_days, config)
    print(f"{len(dishes)} dishes after ranking\n")

    now = datetime.now(timezone.utc)
    output = build_output(
        dishes=dishes,
        window_days=since_days,
        window_start=now - timedelta(days=since_days),
        window_end=now,
        sources_used=sources_used,
        fixture=offline,
    )

    for d in output["dishes"]:
        s = d["metrics"]["sentiment"]
        print(
            f"  {d['trend_score']:5.1f}  {d['name'][:40]:42} "
            f"{d['metrics']['mention_count']:4} mentions  {s['positive']:.0%} pos"
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
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="MiseEnVue trend ingestion")
    ap.add_argument("--since", type=int, default=7, help="window in days (default 7)")
    ap.add_argument(
        "--offline",
        action="store_true",
        help="replay cached/fixture data instead of hitting the network",
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
    args = ap.parse_args()
    return run(args.since, args.offline, args.dry_run, args.force)


if __name__ == "__main__":
    raise SystemExit(main())
