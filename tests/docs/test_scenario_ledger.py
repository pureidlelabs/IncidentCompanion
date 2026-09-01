"""The scenario ledger, held against the specifications it counts.

The constitution requires three numbers to be answerable at any moment: how many
scenarios exist, how many are demonstrated, and how many are recorded as
undemonstrable. A ledger nobody checks answers them wrongly within a week -- a
scenario is renamed and its row is orphaned, or one is added and never appears,
and the count keeps reporting as though it had.

So the ledger is checked to name exactly the scenarios the specifications carry:
no row without a scenario, no scenario without a row. Renaming a requirement or a
scenario breaks this rather than quietly detaching its status.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPECS = sorted((ROOT / "openspec" / "specs").glob("*/spec.md"))
LEDGER = ROOT / "openspec" / "matrix" / "scenarios.md"

STATUSES = {"demonstrated", "undemonstrated", "undemonstrable"}

#: A row is `| requirement | scenario | status | evidence |`. Split rather than
#: matched as one pattern, because a requirement title may hold anything a
#: sentence holds except the cell separator.
def rows() -> list[tuple[str, str, str, str, str]]:
    """Every ledger row as capability, requirement, scenario, status, evidence."""
    found = []
    capability = None
    for line in LEDGER.read_text().splitlines():
        heading = re.match(r"^## (\S+)$", line)
        if heading:
            capability = heading.group(1)
            continue
        if not line.startswith("| ") or capability is None:
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) != 4 or cells[0] in {"Requirement", "---"}:
            continue
        found.append((capability, cells[0], cells[1], cells[2], cells[3]))
    return found


def scenarios() -> list[tuple[str, str, str]]:
    """Every scenario the specifications carry, as capability, requirement, scenario."""
    found = []
    for spec in SPECS:
        capability = spec.parent.name
        requirement = None
        for line in spec.read_text().splitlines():
            if line.startswith("### Requirement: "):
                requirement = line[len("### Requirement: ") :].strip()
            elif line.startswith("#### Scenario: "):
                assert requirement is not None, (
                    f"{capability}: a scenario appears before any requirement"
                )
                found.append((capability, requirement, line[len("#### Scenario: ") :].strip()))
    return found


def test_the_ledger_names_every_scenario_and_invents_none() -> None:
    """The one check that makes the three numbers mean anything."""
    in_specs = set(scenarios())
    in_ledger = {(cap, req, scenario) for cap, req, scenario, _, _ in rows()}

    missing = sorted(in_specs - in_ledger)
    assert not missing, (
        f"{len(missing)} scenarios are in the specifications and not in the ledger, so "
        f"they are counted as nothing. First: {missing[:3]}"
    )

    orphaned = sorted(in_ledger - in_specs)
    assert not orphaned, (
        f"{len(orphaned)} ledger rows name no scenario in any specification. A renamed "
        f"requirement or scenario detaches its row rather than moving it. First: {orphaned[:3]}"
    )


def test_no_scenario_is_listed_twice() -> None:
    """Two rows for one scenario means one of them is a status nobody reads."""
    seen = [(cap, req, scenario) for cap, req, scenario, _, _ in rows()]
    duplicates = sorted({key for key in seen if seen.count(key) > 1})
    assert not duplicates, f"the ledger lists these scenarios more than once: {duplicates}"


@pytest.mark.parametrize("row", rows(), ids=lambda row: f"{row[0]}/{row[2]}"[:80])
def test_a_row_carries_a_status_the_ledger_defines(row: tuple[str, str, str, str, str]) -> None:
    capability, _, scenario, status, _ = row
    assert status in STATUSES, (
        f"{capability}: {scenario!r} is {status!r}, which is not one of {sorted(STATUSES)}"
    )


@pytest.mark.parametrize("row", rows(), ids=lambda row: f"{row[0]}/{row[2]}"[:80])
def test_what_a_status_owes_is_present(row: tuple[str, str, str, str, str]) -> None:
    """Each status owes something different, and an empty cell is how a claim goes unbacked."""
    capability, _, scenario, status, evidence = row

    if status == "demonstrated":
        assert evidence, (
            f"{capability}: {scenario!r} is demonstrated by nothing. Name what demonstrates "
            "it, as a path from the repository root."
        )
        assert (ROOT / evidence).exists(), (
            f"{capability}: {scenario!r} cites {evidence!r}, which does not exist. A citation "
            "that has moved is a scenario counted as demonstrated by nothing."
        )

    if status == "undemonstrable":
        assert evidence, (
            f"{capability}: {scenario!r} is recorded as undemonstrable with no reason. The "
            "reason is the whole value of the record -- it is what a later reader judges."
        )
        assert not (ROOT / evidence).exists(), (
            f"{capability}: {scenario!r} is undemonstrable and cites a path. If something "
            "demonstrates it, it is demonstrated."
        )

    if status == "undemonstrated":
        assert not evidence, (
            f"{capability}: {scenario!r} is undemonstrated and carries {evidence!r}. Either it "
            "is demonstrated by that, or the cell is empty."
        )


def test_the_stated_totals_are_the_counted_totals() -> None:
    """The summary is what anybody reads. Left to drift, it answers the three numbers wrongly.

    Stated in the file rather than computed on the fly because the numbers are quoted
    outside this repository, and a number nobody can read without running a test is one
    that gets recalled instead.
    """
    counted = {status: 0 for status in STATUSES}
    for _, _, _, status, _ in rows():
        if status in counted:
            counted[status] += 1

    body = LEDGER.read_text()
    stated = {
        label.lower(): int(value)
        for label, value in re.findall(r"^\| (Scenarios|Demonstrated|Undemonstrable|Undemonstrated) \| (\d+) \|$", body, flags=re.M)
    }
    assert len(stated) == 4, (
        "the ledger's summary is missing a line. It states Scenarios, Demonstrated, "
        f"Undemonstrable and Undemonstrated; found {sorted(stated)}"
    )

    assert stated["scenarios"] == len(rows()), (
        f"the ledger says {stated['scenarios']} scenarios and lists {len(rows())}"
    )
    for status in ("demonstrated", "undemonstrable", "undemonstrated"):
        assert stated[status] == counted[status], (
            f"the ledger says {stated[status]} {status} and lists {counted[status]}"
        )


def test_every_specification_has_a_section() -> None:
    """A specification with no section reads as one with no scenarios."""
    sections = set(re.findall(r"^## (\S+)$", LEDGER.read_text(), flags=re.M))
    for spec in SPECS:
        assert spec.parent.name in sections, (
            f"the ledger has no section for {spec.parent.name}, so its scenarios are "
            "counted as nothing rather than as untraced."
        )
