"""Reading the scenario ledger, once.

**Two readers of one file is the defect, not a duplication to tidy.** The
command answering how many scenarios there are has to count exactly what the
check holding the rows against the specifications counts. Where they disagree,
the number reported and the number checked are two answers with nobody able to
tell which is wrong.

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

#: A test's file and its title path, as a citation and a report both name it:
#: `server/test/x.test.ts :: a describe > a case`.
FILE_AND_TITLE = " :: "
TITLE_PATH = " > "

#: Between the tests one row cites.
CITATIONS = " ; "


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


def citations(evidence: str) -> list[tuple[str, str]]:
    """The tests a `demonstrated` row's evidence names, as (path, title path).

    A citation carrying no title comes back with an empty one, which is a path
    rather than a test and certifies nothing.
    """
    found = []
    for one in evidence.split(CITATIONS):
        path, _, title = one.strip().partition(FILE_AND_TITLE)
        found.append((path.strip(), title.strip()))
    return found
