"""Financial baseline entrypoint.

    python -m finance.budget                        # reads data/in/pnl.csv
    python -m finance.budget --pnl path/to.csv
    python -m finance.budget --dry-run              # print, don't write

Writes data/out/budget.json -- the spending envelope and, critically, the
constraints Parts 2 and 3 must respect.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import yaml

from finance.allocate import allocate, build_rationale, evaluate_benchmarks
from finance.pnl import parse_pnl

CONFIG_PATH = Path("finance/config.yaml")
PNL_PATH = Path("data/in/pnl.csv")
OUT_PATH = Path("data/out/budget.json")

SCHEMA_VERSION = 1


def run(pnl_path: Path, dry_run: bool) -> int:
    config = yaml.safe_load(CONFIG_PATH.read_text())

    if not pnl_path.is_file():
        print(f"No P&L at {pnl_path}")
        return 1

    pnl = parse_pnl(pnl_path, config)
    ratios = pnl.ratios()
    if not ratios:
        print("P&L has no revenue lines; cannot compute ratios.")
        return 1

    benchmarks = evaluate_benchmarks(ratios, config)
    allocation = allocate(pnl, config)
    rationale = build_rationale(pnl, ratios, benchmarks, allocation)

    output = {
        "_meta": {"schema_version": SCHEMA_VERSION, "source": str(pnl_path)},
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "summary": {
            "revenue": round(pnl.revenue, 2),
            "total_expenses": round(pnl.total_expenses, 2),
            "net_profit": round(pnl.net_profit, 2),
            "by_category": {k: round(v, 2) for k, v in pnl.totals.items()},
        },
        "ratios": ratios,
        "benchmarks": benchmarks,
        "health": {"band": allocation["band"]},
        "allocation": {
            "monthly_revenue": allocation["monthly_revenue"],
            "total_budget": allocation["total_budget"],
            "split": allocation["split"],
        },
        "constraints": allocation["constraints"],
        "rationale": rationale,
        "unclassified": [{"line_item": n, "amount": a} for n, a in pnl.unclassified],
    }

    _print_report(output)

    if dry_run:
        print("\n--dry-run: not writing.")
        return 0

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(output, indent=2) + "\n")
    print(f"\nWrote {OUT_PATH}")
    return 0


def _print_report(o: dict) -> None:
    r, a = o["ratios"], o["allocation"]
    print(f"\nRevenue          ${o['summary']['revenue']:>12,.0f}")
    print(f"Net profit       ${o['summary']['net_profit']:>12,.0f}  ({r['net_margin_pct']:.1%})")
    print(f"\nFood cost         {r['food_cost_pct']:>12.1%}")
    print(f"Labor cost        {r['labor_cost_pct']:>12.1%}")
    print(f"PRIME COST        {r['prime_cost_pct']:>12.1%}   <- drives the band")
    print(f"\nBand: {o['health']['band'].upper()}")
    print(f"Monthly budget   ${a['total_budget']['amount']:>12,.0f}  "
          f"({a['total_budget']['pct_of_revenue']:.0%} of revenue)")
    for k, v in a["split"].items():
        print(f"  {k:<22} ${v:>10,.0f}")

    flagged = [b for b in o["benchmarks"] if b["status"] in ("critical", "warning")]
    if flagged:
        print("\nOff-benchmark:")
        for b in flagged:
            print(f"  [{b['status']:8}] {b['metric']:<18} {b['value']:.1%} "
                  f"(target {b['target_low']:.0%}-{b['target_high']:.0%})")

    print("\nRationale:")
    for line in o["rationale"]:
        print(f"  - {line}")

    if o["unclassified"]:
        print("\nUnclassified line items:")
        for u in o["unclassified"]:
            print(f"  {u['line_item']}: ${u['amount']:,.0f}")


def main() -> int:
    ap = argparse.ArgumentParser(description="MiseEnVue financial baseline")
    ap.add_argument("--pnl", type=Path, default=PNL_PATH, help="P&L CSV path")
    ap.add_argument("--dry-run", action="store_true", help="print without writing")
    args = ap.parse_args()
    return run(args.pnl, args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
