"""Connector interface and the disk cache every connector writes through.

Adding a source means subclassing Connector and implementing two methods.
Nothing downstream changes.

The cache is not an optimization. A rate limit or dead wifi during judging is
the most likely way this demo dies, so every pull is written to disk and
--offline replays the last good one without touching the network.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from ingestion.schema import Post

RAW_DIR = Path("data/raw")
FIXTURE_DIR = Path("data/fixtures")

# HTTP libraries put the full request URL in their exception text, and for a
# key-in-querystring API that means the credential lands in logs, task output,
# and anything that scrapes them. Redact before printing.
_SECRET_PARAM = re.compile(
    r"([?&](?:key|api_key|apikey|access_token|token)=)[^&\s]+", re.IGNORECASE
)


def _redact(value: object) -> str:
    return _SECRET_PARAM.sub(r"\1REDACTED", str(value))


class Connector(ABC):
    """One social/search source.

    Subclasses implement fetch_raw() (talk to the network, return whatever the
    API gives back) and parse() (turn that payload into Posts). Caching,
    offline replay, and error isolation are handled here.
    """

    name: str = "unnamed"

    def __init__(self, config: dict[str, Any]):
        self.config = config

    @abstractmethod
    def fetch_raw(self, since_days: int) -> list[dict[str, Any]]:
        """Hit the network. Return the source's payload, unmodified."""

    @abstractmethod
    def parse(self, raw: list[dict[str, Any]]) -> list[Post]:
        """Map a raw payload into Posts."""

    # -- caching ----------------------------------------------------------

    def fetch(self, since_days: int, offline: bool = False) -> list[Post]:
        """Return Posts, from the network or from cache.

        Offline mode prefers the newest cached pull and falls back to the
        committed fixture. A connector that fails is logged and returns
        nothing rather than taking the whole run down with it -- a partial
        result still demos.
        """
        if offline:
            raw = self._load_cached()
            if raw is None:
                print(f"  [{self.name}] no cache or fixture, skipping")
                return []
            return self.parse(raw)

        try:
            raw = self.fetch_raw(since_days)
        except Exception as exc:
            print(f"  [{self.name}] fetch failed ({_redact(exc)}); falling back to cache")
            raw = self._load_cached()
            if raw is None:
                return []
        else:
            self._write_cache(raw)

        return self.parse(raw)

    def _write_cache(self, raw: list[dict[str, Any]]) -> None:
        out_dir = RAW_DIR / self.name
        out_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%dT%H%M%S")
        path = out_dir / f"{stamp}.json"
        path.write_text(json.dumps(raw, indent=2, default=str))
        print(f"  [{self.name}] cached {len(raw)} records -> {path}")

    def _load_cached(self) -> list[dict[str, Any]] | None:
        """Newest cached pull, else the committed fixture, else None."""
        cache_dir = RAW_DIR / self.name
        if cache_dir.is_dir():
            pulls = sorted(cache_dir.glob("*.json"))
            if pulls:
                print(f"  [{self.name}] replaying {pulls[-1]}")
                return json.loads(pulls[-1].read_text())

        fixture = FIXTURE_DIR / f"{self.name}.json"
        if fixture.is_file():
            print(f"  [{self.name}] replaying fixture {fixture}")
            return json.loads(fixture.read_text())

        return None
