"""Build the pre-operator trace: raw videos, asks, what Discover would show.

    python -m ingestion.signal_lab
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from ingestion.connectors.base import RAW_DIR
from ingestion.desires import lab_from_videos

OUT_PATH = Path("data/out/signal_lab.json")
TRENDS_PATH = Path("data/out/trends.json")


def load_youtube_raw() -> tuple[list[dict], str]:
    cache_dir = RAW_DIR / "youtube"
    if cache_dir.is_dir():
        pulls = sorted(cache_dir.glob("*.json"))
        if pulls:
            return json.loads(pulls[-1].read_text()), str(pulls[-1])
    return [], ""


def load_dishes() -> list[dict]:
    if not TRENDS_PATH.is_file():
        return []
    try:
        payload = json.loads(TRENDS_PATH.read_text())
    except json.JSONDecodeError:
        return []
    dishes = payload.get("dishes")
    return dishes if isinstance(dishes, list) else []


def build_signal_lab() -> dict:
    videos, source_path = load_youtube_raw()
    lab = lab_from_videos(videos, load_dishes())
    lab["generatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lab["rawPath"] = source_path
    return lab


def write_signal_lab(path: Path = OUT_PATH) -> dict:
    lab = build_signal_lab()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(lab, indent=2) + "\n")
    print(
        f"  [lab] {lab['videoCount']} videos, {lab['commentCount']} comments, "
        f"{lab['askCount']} asks → {path}"
    )
    return lab


def main() -> int:
    write_signal_lab()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
