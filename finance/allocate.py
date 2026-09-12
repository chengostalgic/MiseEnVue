"""Benchmark comparison and budget allocation.

Turns P&L ratios into a spending envelope and, more importantly, into the
constraints Parts 2 and 3 have to respect.

No forecasting and no ROI projection. There is no historical campaign data to
fit against, so any "this returns 3.2x" number would be invented, and an
invented multiple is the kind of thing that collapses under one question from
a judge. This computes what is affordable and stops.
"""

from __future__ import annotations

from typing import Any

from finance.pnl import PnL

BAND_ORDER = ["healthy", "stable", "tight", "distressed"]


def evaluate_benchmarks(ratios: dict[str, float], config: dict[str, Any]) -> list[dict]:
    """Compare each ratio against its industry range."""
    out = []
    for metric, band in config["benchmarks"].items():
        value = ratios.get(metric)
        if value is None:
            continue

        # Margin is the one metric where higher is better; everything else is a
        # cost, where exceeding the range is the bad direction.
        higher_is_better = metric == "net_margin_pct"
        if higher_is_better:
            status = "good" if value >= band["low"] else (
                "warning" if value >= band["low"] / 2 else "critical"
            )
        elif value <= band["high"]:
            status = "good" if value >= band["low"] else "low"
        else:
            status = "critical" if value > band["high"] * 1.08 else "warning"

        out.append({
            "metric": metric,
            "value": value,
            "target_low": band["low"],
            "target_high": band["high"],
            "status": status,
        })
    return out


def classify_band(prime_cost_pct: float, config: dict[str, Any]) -> str:
    """Map prime cost to a health band.

    Prime cost -- food plus labor as a share of revenue -- is the standard
    single measure of restaurant health, which is why it and not net margin
    drives the allocation. Net margin swings on one-off items; prime cost is
    structural.
    """
    for name in BAND_ORDER:
        if prime_cost_pct < config["bands"][name]["max_prime_cost"]:
            return name
    return "distressed"


def allocate(pnl: PnL, config: dict[str, Any]) -> dict[str, Any]:
    """Compute the monthly trend/marketing envelope and its constraints.

    The number is driven by earnings, with the revenue benchmark acting only
    as a sanity cap:

      earnings ceiling  -- a share of profit BEFORE marketing, which is the
                           pool the spend actually comes out of. Using net
                           profit here would double-count, since net profit
                           already has marketing deducted.
      benchmark ceiling -- a share of revenue. Not the driver, just a guard
                           against one unusually profitable month justifying
                           a budget the kitchen has no capacity to execute.
      floor             -- keeps a struggling operation from going completely
                           dark, which is its own risk.

    Reporting which one binds matters as much as the number: "limited by
    earnings" and "limited by benchmark" call for different conversations.
    """
    ratios = pnl.ratios()
    if not ratios:
        raise ValueError("P&L has no revenue; cannot compute an allocation.")

    band_name = classify_band(ratios["prime_cost_pct"], config)
    band = config["bands"][band_name]
    revenue = pnl.revenue

    pbm = max(pnl.profit_before_marketing, 0.0)
    earnings_ceiling = round(pbm * band["reinvestment_share"], 2)
    benchmark_ceiling = round(revenue * band["max_pct_of_revenue"], 2)

    total = min(earnings_ceiling, benchmark_ceiling)
    binding = "earnings" if earnings_ceiling <= benchmark_ceiling else "benchmark"

    # A loss-making business gets a floor, not zero: going dark is its own
    # risk, and the floor is small enough to be maintenance rather than a bet.
    floor = round(revenue * config["minimum_spend_pct_of_revenue"], 2)
    if total < floor:
        total, binding = floor, "floor"

    split = {k: round(total * pct, 2) for k, pct in band["split"].items()}

    capex_allowed = band_name in config["constraints"]["capex_allowed_bands"]
    cm_pct = pnl.contribution_margin_pct(config["hourly_labor_keywords"])
    return {
        "band": band_name,
        "monthly_revenue": round(revenue, 2),
        "total_budget": {
            "amount": total,
            "pct_of_revenue": round(total / revenue, 4) if revenue else 0.0,
            "binding_constraint": binding,
            "earnings_ceiling": earnings_ceiling,
            "benchmark_ceiling": benchmark_ceiling,
            "profit_before_marketing": round(pbm, 2),
            "reinvestment_share": band["reinvestment_share"],
        },
        "current_spend": _current_spend(pnl, total),
        "breakeven": breakeven(total, cm_pct, config),
        "split": split,
        "constraints": {
            "max_trial_ingredient_spend": split.get("menu_experimentation", 0.0),
            "max_influencer_fee": split.get("influencer", 0.0),
            "max_paid_social_spend": split.get("paid_social", 0.0),
            # Capex comes out of reserve, and only if the business can carry it.
            # Below that, Part 2 must reject any dish needing new equipment.
            "capex_available": split.get("reserve", 0.0) if capex_allowed else 0.0,
            "min_dish_margin_pct": config["constraints"]["min_dish_margin_pct"][band_name],
        },
    }


def breakeven(budget: float, cm_pct: float, config: dict[str, Any]) -> dict[str, Any]:
    """What this spend has to produce to pay for itself.

    Entirely arithmetic on the restaurant's own numbers -- no forecast, no
    assumed return. It does not claim the spend will work; it states the bar
    it has to clear, which the owner can judge against their own floor.
    """
    if cm_pct <= 0:
        return {"computable": False, "reason": "contribution margin is zero or negative"}

    avg_check = config.get("avg_check")
    revenue_needed = round(budget / cm_pct, 2)
    out = {
        "computable": True,
        "contribution_margin_pct": cm_pct,
        "incremental_revenue_needed": revenue_needed,
        "pct_of_current_revenue": None,
    }
    if avg_check:
        covers = revenue_needed / avg_check
        out["avg_check"] = avg_check
        out["incremental_covers_needed"] = round(covers)
        out["incremental_covers_per_day"] = round(covers / 30, 1)
    return out


def _current_spend(pnl: PnL, recommended: float) -> dict[str, Any]:
    """Compare recommendation against what they already spend.

    A recommendation in isolation is a target; against current spend it is a
    direction. "Nearly double your marketing" is a materially different message
    from "$7,200" and the P&L already contains the answer.
    """
    current = pnl.totals.get("marketing", 0.0)
    out = {
        "current_monthly": round(current, 2),
        "current_pct_of_revenue": round(current / pnl.revenue, 4) if pnl.revenue else 0.0,
        "recommended_monthly": recommended,
        "delta": round(recommended - current, 2),
    }
    out["direction"] = (
        "increase" if out["delta"] > 1 else "decrease" if out["delta"] < -1 else "hold"
    )
    if current > 0:
        out["multiple"] = round(recommended / current, 2)
    return out


def build_rationale(
    pnl: PnL, ratios: dict[str, float], benchmarks: list[dict], allocation: dict
) -> list[str]:
    """Plain-language explanation of the number.

    The owner has to act on this, so it says what is wrong and what it means
    rather than restating the ratios they can already see.
    """
    band = allocation["band"]
    tb, cs, be = allocation["total_budget"], allocation["current_spend"], allocation["breakeven"]

    lines = [
        f"Prime cost is {ratios['prime_cost_pct']:.1%} of revenue "
        f"(food {ratios['food_cost_pct']:.1%} + labor {ratios['labor_cost_pct']:.1%}), "
        f"which places this business in the '{band}' band."
    ]

    if band == "distressed":
        lines.append(
            "At this prime cost the constraint is not marketing reach -- it is food "
            "or labor cost. Budget is set to maintenance level deliberately. Spending "
            "the remaining margin on ads would accelerate the problem rather than "
            "solve it; a one-point reduction in food cost is worth more than any "
            "campaign this budget could buy."
        )
    elif band == "tight":
        lines.append(
            "There is room to act, but only on things that pay back quickly. The "
            "allocation leans toward menu experimentation over paid reach, because a "
            "test batch is cheap and reversible where an ad spend is neither."
        )

    # Which ceiling bound the number, and what that implies.
    if tb["binding_constraint"] == "earnings":
        lines.append(
            f"Before marketing, the business earns ${tb['profit_before_marketing']:,.0f}/month "
            f"(${pnl.net_profit:,.0f} net profit plus the ${cs['current_monthly']:,.0f} it "
            f"already spends on marketing). Reinvesting "
            f"{tb['reinvestment_share']:.0%} of that gives ${tb['amount']:,.0f} and leaves "
            f"${tb['profit_before_marketing'] - tb['amount']:,.0f} in profit."
        )
    elif tb["binding_constraint"] == "floor":
        lines.append(
            f"Earnings do not support a meaningful budget, so this is a minimum "
            f"maintenance figure. Going completely dark carries its own risk, but "
            f"${tb['amount']:,.0f} is a holding position, not a growth plan."
        )
    else:
        lines.append(
            f"Earnings could support ${tb['earnings_ceiling']:,.0f}, but the budget is "
            f"capped at ${tb['benchmark_ceiling']:,.0f} — "
            f"{tb['pct_of_revenue']:.1%} of revenue, the ceiling for an independent "
            f"restaurant this size. Spending beyond it tends to outrun what a kitchen "
            f"this size can execute."
        )

    # Recommendation against actual current spend.
    if cs["direction"] == "increase" and cs.get("multiple"):
        lines.append(
            f"They currently spend ${cs['current_monthly']:,.0f}/month "
            f"({cs['current_pct_of_revenue']:.1%} of revenue). This is a "
            f"{cs['multiple']:.1f}x increase — treat it as a target to phase into, "
            f"not a switch to flip."
        )
    elif cs["direction"] == "decrease":
        lines.append(
            f"They currently spend ${cs['current_monthly']:,.0f}/month, which is "
            f"${abs(cs['delta']):,.0f} above what these economics support."
        )

    # The bar the spend has to clear -- arithmetic, not forecast.
    if be.get("computable") and be.get("incremental_covers_per_day"):
        lines.append(
            f"At a {be['contribution_margin_pct']:.1%} contribution margin, "
            f"${tb['amount']:,.0f} needs ${be['incremental_revenue_needed']:,.0f} in "
            f"incremental revenue to break even — about "
            f"{be['incremental_covers_per_day']} extra covers per day at a "
            f"${be['avg_check']:.0f} average check. That is the bar, not a forecast."
        )

    for b in benchmarks:
        if b["status"] == "critical":
            lines.append(
                f"{b['metric'].replace('_', ' ')} at {b['value']:.1%} is outside the "
                f"{b['target_low']:.0%}-{b['target_high']:.0%} industry range and is "
                f"the first thing to fix."
            )

    if pnl.net_profit <= 0:
        lines.append(
            f"The business is running at a loss of ${abs(pnl.net_profit):,.0f}/month. "
            "Any spend here is funded from cash reserves, not profit."
        )

    if pnl.unclassified:
        total = sum(a for _, a in pnl.unclassified)
        lines.append(
            f"{len(pnl.unclassified)} line item(s) worth ${total:,.0f} could not be "
            "categorized and are excluded from these ratios. Check them before "
            "relying on this figure."
        )

    return lines
