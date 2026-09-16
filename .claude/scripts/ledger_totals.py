#!/usr/bin/env python3
"""Count the scenario ledger's rows, and print the four numbers the constitution asks for.

    .claude/scripts/ledger_totals.py

Reads the rows through `tests/_ledger.py`, which is what
`tests/docs/test_scenario_ledger.py` counts with.

Exits non-zero rather than answering where the answer would be a guess: a file
carrying no rows, or a status the ledger does not define.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from tests._ledger import STATUSES, rows  # noqa: E402

LEDGER = ROOT / "openspec" / "matrix" / "scenarios.md"

#: `Scenarios` is every row; the rest are one status each.
LABELS = ("Scenarios", *(one.capitalize() for one in STATUSES))


def totals(ledger: Path) -> dict[str, int]:
    """What the rows count, by label."""
    counted = dict.fromkeys(LABELS, 0)
    for capability, _, scenario, status, _ in rows(ledger):
        counted["Scenarios"] += 1
        # An empty cell is the default status, which `_ledger.STATUSES` names
        # first. Anything else is a row the ledger's own check refuses, so
        # counting it into some bucket would answer for a row nothing accepts.
        named = status or STATUSES[0]
        if named not in STATUSES:
            raise SystemExit(
                f"{capability}: {scenario!r} carries the status {status!r}, which the ledger "
                "does not define. Fix the row; a total counted over it means nothing."
            )
        counted[named.capitalize()] += 1
    return counted


def main() -> int:
    parsed = argparse.ArgumentParser(description=__doc__)
    parsed.add_argument("--ledger", type=Path, default=LEDGER, help="the file to read")
    args = parsed.parse_args()

    counted = totals(args.ledger)
    # **A file with no rows is the wrong file**, rather than a ledger that has
    # lost every scenario. Printing zeroes is the one answer nobody checks.
    if counted["Scenarios"] == 0:
        raise SystemExit(f"{args.ledger} carries no scenario rows; it is not a ledger")

    print(" ".join(f"{label.lower()} {counted[label]}" for label in LABELS))
    return 0


if __name__ == "__main__":
    sys.exit(main())
