"""Reading the scenario ledger, once.

**Two readers of one file is the defect, not a duplication to tidy.** The
ledger states its totals above the rows they count, and a command that writes
those totals has to agree with the check that reads them. Where they disagree
the command produces a file the check refuses, and running it again is a fixed
point -- which is worse than no command at all.

The shape a reader has to get right: rows belong to the `## capability`
heading above them, so the table in the section documenting the row format is
not a row, and neither is a heading line or its underline.
"""

from __future__ import annotations

import re
from pathlib import Path

#: A row's four cells: requirement, scenario, status, evidence.
CELLS = 4

#: The statuses a row may carry. An empty cell means the first of them.
STATUSES = ("undemonstrated", "demonstrated", "undemonstrable", "unbuilt")


def rows(ledger: Path) -> list[tuple[str, str, str, str, str]]:
    """Every row as capability, requirement, scenario, status, evidence.

    Rows outside a `## capability` section are not rows: the ledger's own
    introduction carries an example table, and counting it makes the totals
    disagree with every check that reads them.
    """
    found: list[tuple[str, str, str, str, str]] = []
    capability: str | None = None
    for line in ledger.read_text(encoding="utf-8").splitlines():
        heading = re.match(r"^## (\S+)$", line)
        if heading:
            capability = heading.group(1)
            continue
        if not line.startswith("| ") or capability is None:
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) != CELLS or cells[0] in {"Requirement", "---"}:
            continue
        found.append((capability, cells[0], cells[1], cells[2], cells[3]))
    return found
