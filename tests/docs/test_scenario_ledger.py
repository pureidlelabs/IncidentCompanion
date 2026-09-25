"""The scenario ledger, held against the specifications it counts.

The constitution requires four numbers to be answerable at any moment, and
`.claude/scripts/ledger_totals.py` answers them from these rows. A ledger nobody
checks answers them wrongly within a week -- a scenario is renamed and its row is
orphaned, or one is added and never appears, and the count keeps reporting as
though it had.

So the ledger is checked to name exactly the scenarios the specifications carry:
no row without a scenario, no scenario without a row. Renaming a requirement or a
scenario breaks this rather than quietly detaching its status.
"""

from __future__ import annotations

import re

import pytest

from tests import certify
from tests._ledger import FILE_AND_TITLE, citations
from tests._ledger import rows as ledger_rows
from tests._repo import REPO_ROOT

ROOT = REPO_ROOT
SPECS = sorted((ROOT / "openspec" / "specs").glob("*/spec.md"))
LEDGER = ROOT / "openspec" / "matrix" / "scenarios.md"

STATUSES = {"demonstrated", "undemonstrated", "undemonstrable", "unbuilt"}

#: A row is `| requirement | scenario | status | evidence |`. Split rather than
#: matched as one pattern, because a requirement title may hold anything a
#: sentence holds except the cell separator.
def rows() -> list[tuple[str, str, str, str, str]]:
    """Every ledger row as capability, requirement, scenario, status, evidence.

    **The reading lives in `tests/_ledger.py`**, because the command answering
    the totals has to count exactly what this counts.
    """
    return ledger_rows(LEDGER)


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


#: A string literal in a test file, in any of the three quotes.
LITERAL = re.compile(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"|`((?:[^`\\]|\\.)*)`")

#: Where a title is filled in at run time: `it.each`'s `%s`, a `${}` or a `$name`.
HOLE = re.compile(r"%[sdifjo#]|\$\{[^}]*\}|\$[\w.]+")

#: A hook that runs while a case is current, and so tags it as the case's body would.
PER_TEST_HOOK = re.compile(r"\b(beforeEach|afterEach|onTestFinished|onTestFailed)\(")


def names_the_case(path: str, title: str) -> bool:
    """Whether the file at `path` declares every segment of the case `title` names."""
    text = (ROOT / path).read_text(encoding="utf-8")
    *outer, last = title.split(" > ")
    last = re.sub(r"\[[^\]]*\]$", "", last)
    if path.endswith(".py"):
        return re.search(rf"def {re.escape(last)}\(", text) is not None and all(
            re.search(rf"class {re.escape(one)}\b", text) for one in outer)
    literals = []
    for match in LITERAL.finditer(text):
        literal = next(g for g in match.groups() if g is not None)
        literal = re.sub(r"\\u([0-9a-fA-F]{4})", lambda code: chr(int(code.group(1), 16)), literal)
        literal = re.sub(r"\\(.)", r"\1", literal)
        # A literal that is all hole, such as a bare `${path}`, would match any title.
        if len(HOLE.sub("", literal).strip()) >= 3:
            literals.append(".+".join(re.escape(part) for part in HOLE.split(literal)))
    return all(any(re.fullmatch(one, segment, re.S) for one in literals) for segment in [*outer, last])


@pytest.mark.parametrize("row", rows(), ids=lambda row: f"{row[0]}/{row[2]}"[:80])
def test_what_a_status_owes_is_present(row: tuple[str, str, str, str, str]) -> None:
    """Each status owes something different, and an empty cell is how a claim goes unbacked."""
    capability, _, scenario, status, evidence = row

    if status == "demonstrated":
        assert evidence, (
            f"{capability}: {scenario!r} is demonstrated by nothing. Name the tests that "
            "demonstrate it, as `path :: describe > case`."
        )
        for path, title in citations(evidence):
            assert title, (
                f"{capability}: {scenario!r} cites {path!r}, a file rather than a test in it. "
                "A path existing demonstrates nothing; name the case, as `path :: describe > case`."
            )
            assert (ROOT / path).is_file(), (
                f"{capability}: {scenario!r} cites {path!r}, which does not exist. A citation "
                "that has moved is a scenario counted as demonstrated by nothing."
            )
            assert names_the_case(path, title), (
                f"{capability}: {scenario!r} cites {title!r}, which {path} does not declare. "
                "A mistyped title is caught here rather than when the merge group ejects the entry."
            )
            source = (ROOT / path).read_text(encoding="utf-8")
            assert not ("app-harness" in source and PER_TEST_HOOK.search(source)), (
                f"{capability}: {scenario!r} cites {path!r}, which declares a per-test hook. "
                "The booted app tags whichever case is current, so a request made in a hook "
                "tags a case whose own body reached nothing."
            )
            reaching = {"server", "screen", "containers"} | (
                {"client"}
                if certify.reaches_the_server(path)
                or (path + FILE_AND_TITLE + title, capability) in certify.DRAWN_SURFACE
                else set()
            )
            assert reaching & set(certify.owners(path)), (
                f"{capability}: {scenario!r} cites {path!r}, which no certifying run reads at the "
                "product's entry point: a repository check, a Playwright spec, or a client test "
                "that renders no container or replaces what it asks the server."
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

    if status == "unbuilt":
        assert evidence, (
            f"{capability}: {scenario!r} is recorded as unbuilt with no reason. What is absent "
            "and where the decision to keep it lives are the whole value of the record."
        )
        assert not (ROOT / evidence).exists(), (
            f"{capability}: {scenario!r} is unbuilt and cites a path. If something demonstrates "
            "it, the subject exists and it is not unbuilt."
        )

    if status == "undemonstrated":
        assert not evidence, (
            f"{capability}: {scenario!r} is undemonstrated and carries {evidence!r}. Either it "
            "is demonstrated by that, or the cell is empty."
        )


def test_no_total_is_stored_in_the_file() -> None:
    """A total stored beside the rows it counts conflicts on every branch that adds a row."""
    stored = [
        line
        for line in LEDGER.read_text().splitlines()
        if re.match(r"^\| (Scenarios|Demonstrated|Undemonstrable|Unbuilt|Undemonstrated) \|", line)
    ]
    assert not stored, (
        "the ledger states a total it also counts, so every branch that adds a row edits the "
        "same lines and conflicts with every other one in flight. Read the numbers with "
        f".claude/scripts/ledger_totals.py instead. Found: {stored}"
    )


def test_every_specification_has_a_section() -> None:
    """A specification with no section reads as one with no scenarios."""
    sections = set(re.findall(r"^## (\S+)$", LEDGER.read_text(), flags=re.M))
    for spec in SPECS:
        assert spec.parent.name in sections, (
            f"the ledger has no section for {spec.parent.name}, so its scenarios are "
            "counted as nothing rather than as untraced."
        )
