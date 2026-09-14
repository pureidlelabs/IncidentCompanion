#!/usr/bin/env python3
"""Count the scenario ledger's rows, and write the totals it states.

    .claude/scripts/ledger_totals.py            # print them
    .claude/scripts/ledger_totals.py --write    # rewrite the header from the rows

The header is derived from the rows below it and lives in the file on purpose --
the numbers are quoted outside this repository. Generating it is what stops it
being maintained by hand: the rows of two branches merge and the header does
not, so a pair that each demonstrate a scenario leaves it one out.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEDGER = ROOT / "openspec" / "matrix" / "scenarios.md"

#: The labels the summary states, in the order it states them.
LABELS = ("Scenarios", "Demonstrated", "Undemonstrable", "Unbuilt", "Undemonstrated")

#: A row's status cell, empty meaning the default.
OF_STATUS = {
    "demonstrated": "Demonstrated",
    "undemonstrable": "Undemonstrable",
    "unbuilt": "Unbuilt",
    "undemonstrated": "Undemonstrated",
}


def cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def totals(body: str) -> dict[str, int]:
    """What the rows say, as the header states it."""
    counted = dict.fromkeys(LABELS, 0)
    for line in body.splitlines():
        if not line.startswith("| "):
            continue
        row = cells(line)
        # Four columns, and neither the header row nor its underline.
        if len(row) != 4 or row[2] in ("Status", "---"):
            continue
        counted["Scenarios"] += 1
        label = OF_STATUS.get(row[2] or "undemonstrated")
        if label is None:
            raise SystemExit(f"a row carries an unknown status {row[2]!r}: {line.strip()}")
        counted[label] += 1
    return counted


def rewritten(body: str, counted: dict[str, int]) -> str:
    """The same file with each stated total replaced by the counted one."""
    out: list[str] = []
    seen: set[str] = set()
    for line in body.splitlines(keepends=True):
        row = cells(line)
        if len(row) == 2 and row[0] in LABELS and row[1].isdigit():
            out.append(f"| {row[0]} | {counted[row[0]]} |\n")
            seen.add(row[0])
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

    body = args.ledger.read_text(encoding="utf-8")
    counted = totals(body)

    if not args.write:
        print(" ".join(f"{label.lower()} {counted[label]}" for label in LABELS))
        return 0

    written = rewritten(body, counted)
    if written != body:
        args.ledger.write_text(written, encoding="utf-8")
        print(f"wrote {args.ledger}")
    else:
        print(f"{args.ledger} already states what its rows count")
    return 0


if __name__ == "__main__":
    sys.exit(main())
