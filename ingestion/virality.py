"""Deciding what actually counts as viral.

Raw view count conflates two different things: a dish going viral, and a
46M-subscriber channel posting an ordinary video. Nick DiGiovanni's median
upload outperforms most channels' best work, so ranking on views alone ranks
channels, not dishes.

The separator is the BREAKOUT RATIO -- a video's views against its own
channel's median. A 2M-view video on a channel that averages 200k means the
*dish* pulled that audience in, because the subscriber base alone does not
explain it. That is the Dubai-chocolate signature: a creator's normal reach
multiplied by public interest in one specific thing.

Three signals, computed per video:

  breakout_ratio   views / channel median. >= 2.0 means the dish drove it.
  views_per_day    still climbing, i.e. mid-surge rather than an old hit.
  trend_marker     the creator framed it as trend coverage ("I tried the
                   viral...") rather than an evergreen recipe.

A video is viral if it clears the view floor AND breaks out or is surging.
Trend markers are recorded separately -- they say the creator is *reporting* a
trend, which is a different and complementary signal to the audience
responding to one.
"""

from __future__ import annotations

import statistics
from datetime import datetime, timezone
from typing import Any


def annotate(videos: dict[str, dict[str, Any]], cfg: dict[str, Any]) -> dict[str, int]:
    """Tag each video with virality signals. Mutates in place.

    Returns a summary count for logging.
    """
    if not videos:
        return {}

    medians = _channel_medians(videos)
    markers = [m.lower() for m in cfg.get("trend_markers", [])]
    min_views = cfg.get("min_views", 50_000)
    breakout_at = cfg.get("breakout_ratio", 2.0)
    surge_at = cfg.get("min_views_per_day", 25_000)

    now = datetime.now(timezone.utc)
    counts = {"viral": 0, "breakout": 0, "surging": 0, "trend_marker": 0}

    for video in videos.values():
        views = video.get("view_count", 0)
        channel = video.get("channel_id") or video.get("channel", "")
        median = medians.get(channel) or 1

        ratio = views / median
        per_day = views / max(1.0, _age_days(video, now))
        title = (video.get("title", "") + " " + video.get("description", "")).lower()
        has_marker = any(m in title for m in markers)

        is_breakout = ratio >= breakout_at
        is_surging = per_day >= surge_at
        is_viral = views >= min_views and (is_breakout or is_surging)
        if cfg.get("require_trend_marker", False):
            # Breakout alone finds viral videos, not viral dishes -- a Hot Ones
            # celebrity interview broke out at 100x with no food trend in it.
            # Requiring the creator to have framed it as trend coverage is what
            # narrows "went viral" down to "a dish went viral".
            is_viral = is_viral and has_marker

        video.update(
            breakout_ratio=round(ratio, 2),
            views_per_day=int(per_day),
            trend_marker=has_marker,
            is_viral=is_viral,
        )

        counts["viral"] += is_viral
        counts["breakout"] += is_breakout
        counts["surging"] += is_surging
        counts["trend_marker"] += has_marker

    return counts


def _channel_medians(videos: dict[str, dict[str, Any]]) -> dict[str, float]:
    """Median views per channel, from the videos in this pull.

    Uses the pull itself as the baseline rather than a separate API call --
    20-50 recent uploads is a fair read on a channel's normal reach, and it
    costs nothing. Median rather than mean so one runaway hit does not raise
    the bar that every other video on that channel is measured against.
    """
    by_channel: dict[str, list[int]] = {}
    for v in videos.values():
        key = v.get("channel_id") or v.get("channel", "")
        by_channel.setdefault(key, []).append(v.get("view_count", 0))
    return {
        ch: statistics.median(views)
        for ch, views in by_channel.items()
        if len(views) >= 3  # too few to establish a baseline
    }


def _age_days(video: dict[str, Any], now: datetime) -> float:
    published = video.get("published_at")
    if not published:
        return 1.0
    try:
        dt = datetime.fromisoformat(published.replace("Z", "+00:00"))
    except ValueError:
        return 1.0
    return max(0.5, (now - dt).total_seconds() / 86400)
