"""P&L parsing and ratio derivation.

Takes a flat line-item CSV and produces the handful of ratios that decide
restaurant health. The parsing is keyword-based rather than exact-match
because real P&Ls are inconsistent -- see finance/config.yaml.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

CATEGORIES = ["revenue", "cogs", "labor", "occupancy", "marketing", "other_opex"]


@dataclass
class PnL:
    """A parsed P&L with everything downstream needs."""

    totals: dict[str, float] = field(default_factory=dict)
    unclassified: list[tuple[str, float]] = field(default_factory=list)
    line_items: dict[str, list[tuple[str, float]]] = field(default_factory=dict)

    @property
    def revenue(self) -> float:
        return self.totals.get("revenue", 0.0)

    @property
    def total_expenses(self) -> float:
        return sum(self.totals.get(c, 0.0) for c in CATEGORIES if c != "revenue")

    @property
    def net_profit(self) -> float:
        return self.revenue - self.total_expenses

    def variable_costs(self, hourly_keywords: list[str]) -> float:
        """Costs that scale with each additional cover.

        COGS plus hourly labor. Salaried management, rent, and insurance do
        not move when one more table sits down, so they are excluded -- this
        is the distinction that makes contribution margin mean something.
        """
        hourly = sum(
            amount
            for name, amount in self.line_items.get("labor", [])
            if any(k in name.lower() for k in hourly_keywords)
        )
        return self.totals.get("cogs", 0.0) + hourly

    def contribution_margin_pct(self, hourly_keywords: list[str]) -> float:
        """Share of each incremental dollar that survives variable costs.

        This is what a marketing dollar has to earn back against, and it is
        computed from their P&L rather than assumed.
        """
        if self.revenue <= 0:
            return 0.0
        return round((self.revenue - self.variable_costs(hourly_keywords)) / self.revenue, 4)

    def ratios(self) -> dict[str, float]:
        """Expense ratios as a share of revenue.

        Prime cost (food + labor) is the one that matters most -- it is the
        standard restaurant health measure and drives the whole allocation.
        """
        rev = self.revenue
        if rev <= 0:
            return {}

        food = self.totals.get("cogs", 0.0)
        labor = self.totals.get("labor", 0.0)
        return {
            "food_cost_pct": round(food / rev, 4),
            "labor_cost_pct": round(labor / rev, 4),
            "prime_cost_pct": round((food + labor) / rev, 4),
            "occupancy_pct": round(self.totals.get("occupancy", 0.0) / rev, 4),
            "marketing_pct": round(self.totals.get("marketing", 0.0) / rev, 4),
            "other_opex_pct": round(self.totals.get("other_opex", 0.0) / rev, 4),
            "net_margin_pct": round(self.net_profit / rev, 4),
        }


def parse_pnl(path: Path, config: dict[str, Any]) -> PnL:
    """Read a line-item CSV into categorized totals.

    Expects columns `line_item` and `monthly_amount`. Amounts are read
    absolute: a P&L that writes expenses as negatives and one that writes them
    positive should produce the same answer, and getting that wrong flips the
    sign on every ratio.
    """
    mapping = config["line_item_map"]
    pnl = PnL(totals={c: 0.0 for c in CATEGORIES}, line_items={c: [] for c in CATEGORIES})

    with path.open(newline="") as fh:
        for row in csv.DictReader(fh):
            name = (row.get("line_item") or "").strip()
            raw = (row.get("monthly_amount") or "").strip()
            if not name or not raw:
                continue
            try:
                amount = abs(float(raw.replace("$", "").replace(",", "")))
            except ValueError:
                pnl.unclassified.append((name, 0.0))
                continue

            category = _categorize(name, mapping)
            if category is None:
                pnl.unclassified.append((name, amount))
                continue

            pnl.totals[category] += amount
            pnl.line_items[category].append((name, amount))

    return pnl


def _categorize(name: str, mapping: dict[str, list[str]]) -> str | None:
    """First matching keyword wins, in config order.

    Order matters: "Beverage COGS" must hit cogs before revenue's "sales"
    keyword gets a chance at something like "Cost of Sales".
    """
    lowered = name.lower()
    for category in CATEGORIES:
        for keyword in mapping.get(category, []):
            if keyword in lowered:
                return category
    return None
