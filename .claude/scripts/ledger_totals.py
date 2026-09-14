#!/usr/bin/env python3
"""Count the scenario ledger's rows, and write the totals it states.

    .claude/scripts/ledger_totals.py            # print them
    .claude/scripts/ledger_totals.py --write    # rewrite the header from the rows

Reads the rows through `tests/_ledger.py`, which is what
`tests/docs/test_scenario_ledger.py` counts with. A second reading here would
let this write a header that check refuses, and running it again would not
help.

Exits non-zero rather than writing where the answer would be a guess: a file
carrying no rows, a header line missing, a status the ledger does not define.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from tests._ledger import STATUSES, rows  # noqa: E402

LEDGER = ROOT / "openspec" / "matrix" / "scenarios.md"

#: The labels the summary states, in the order it states them. `Scenarios` is
#: every row; the rest are one status each, spelled as the summary spells it.
LABELS = ("Scenarios", *(one.capitalize() for one in STATUSES))


def totals(ledger: Path) -> dict[str, int]:
    """What the rows say, as the header states it."""
    counted = dict.fromkeys(LABELS, 0)
    for capability, _, scenario, status, _ in rows(ledger):
        counted["Scenarios"] += 1
        # An empty cell is the default status, which `_ledger.STATUSES` names
        # first. Anything else is a row the ledger's own check refuses, so
        # counting it into some bucket would write a header that check rejects.
        named = status or STATUSES[0]
        if named not in STATUSES:
            raise SystemExit(
                f"{capability}: {scenario!r} carries the status {status!r}, which the ledger "
                "does not define. Fix the row; a total counted over it would be refused."
            )
        counted[named.capitalize()] += 1
    return counted


def rewritten(body: str, counted: dict[str, int]) -> str:
    """The same file with each stated total replaced by the counted one."""
    out: list[str] = []
    seen: set[str] = set()
    for line in body.splitlines(keepends=True):
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) == 2 and cells[0] in LABELS and cells[1].isdigit():
            out.append(f"| {cells[0]} | {counted[cells[0]]} |\n")
            seen.add(cells[0])
            continue
        out.append(line)

    missing = [one for one in LABELS if one not in seen]
    if missing:
        raise SystemExit(f"this file states no {', '.join(missing)} line; it is not a ledger")
    return "".join(out)


def main() -> int:
    parsed = argparse.ArgumentParser(description=__doc__)
    parsed.add_argument("--write", action="store_true", help="rewrite the header in place")
    parsed.add_argument("--ledger", type=Path, default=LEDGER, help="the file to read")
    args = parsed.parse_args()

    counted = totals(args.ledger)
    # **A file with a summary and no rows is the wrong file**, rather than a
    # ledger that has lost every scenario. Writing zeroes into it is the one
    # outcome nobody can be asked to notice.
    if counted["Scenarios"] == 0:
        raise SystemExit(f"{args.ledger} carries no scenario rows; it is not a ledger")

    if not args.write:
        print(" ".join(f"{label.lower()} {counted[label]}" for label in LABELS))
        return 0

    body = args.ledger.read_text(encoding="utf-8")
    written = rewritten(body, counted)
    if written != body:
        args.ledger.write_text(written, encoding="utf-8")
        print(f"wrote {args.ledger}")
    else:
        print(f"{args.ledger} already states what its rows count")
    return 0


if __name__ == "__main__":
    sys.exit(main())
