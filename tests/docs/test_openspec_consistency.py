"""Cross-document consistency for the spec tree, which no other instrument reads.

`openspec validate` checks one document's shape. Vale checks one document's prose.
Neither reads two documents against each other, and that is where every finding of
the first three review rounds came from: a rule the constitution states and no
specification follows, a control the matrix claims and the specification does not
carry, an exception written in one place and contradicted in four others.
"""

from __future__ import annotations

import csv
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
OPENSPEC = ROOT / "openspec"
SPECS = sorted(OPENSPEC.glob("specs/*/spec.md"))
CONSTITUTION = OPENSPEC / "constitution.md"
CONFIG = OPENSPEC / "config.yaml"
MATRIX = OPENSPEC / "matrix" / "asvs.md"

#: Words the vocabulary moved away from, and what replaced them. A specification
#: written before a decision keeps its old nouns and reads as though the decision
#: never happened.
RETIRED = {
    "entitlement": "reach through a group, at a level",
    "entitled to": "reaches",
}

#: Every identifier in a row's first cell, not merely the one it starts with. A row
#: reading `V7.3.1, V7.3.2` names two controls and a check that sees one is blind to
#: the other.
CONTROL = re.compile(r"V\d+\.\d+(?:\.\d+)?")

#: `capability :: Requirement title`, which is what makes a credit checkable.
CREDIT = re.compile(r"([a-z][a-z-]+) :: (.+?)\s*\|")


def matrix_rows(section: str) -> list[tuple[list[str], str]]:
    """The controls and the third cell of every row in one section of the matrix."""
    body = MATRIX.read_text()
    bounds = {"Answered": ("## Answered", "## Gaps"),
              "Gaps": ("## Gaps", "## Deviations")}[section]
    block = body[body.index(bounds[0]) : body.index(bounds[1])]
    rows = []
    for line in block.splitlines():
        if not line.startswith("| V"):
            continue
        cells = line.split("|")
        rows.append((CONTROL.findall(cells[1]), cells[3]))
    return rows


def requirement_titles() -> set[tuple[str, str]]:
    found = set()
    for spec in SPECS:
        for title in re.findall(r"^### Requirement: (.+)$", spec.read_text(), flags=re.M):
            found.add((spec.parent.name, title.strip()))
    return found


def spec_ids() -> list[str]:
    return [p.parent.name for p in SPECS]


@pytest.mark.parametrize("spec", SPECS, ids=spec_ids())
def test_a_scenario_states_a_condition_an_action_and_a_result(spec: Path) -> None:
    """A scenario missing one of the three is a title with bullets under it."""
    body = spec.read_text()
    blocks = re.split(r"^#### Scenario: ", body, flags=re.M)[1:]
    for block in blocks:
        title = block.splitlines()[0]
        for word in ("GIVEN", "WHEN", "THEN"):
            assert f"- {word} " in block, f"{spec.parent.name}: scenario {title!r} has no {word}"


@pytest.mark.parametrize("spec", SPECS, ids=spec_ids())
def test_a_specification_does_not_use_a_retired_word(spec: Path) -> None:
    body = spec.read_text().lower()
    for word, replacement in RETIRED.items():
        assert word not in body, (
            f"{spec.parent.name} still says {word!r}; the vocabulary moved to {replacement!r}. "
            "A specification carrying the old noun reads as though the decision never happened."
        )


@pytest.mark.parametrize("spec", SPECS, ids=spec_ids())
def test_saying_an_analyst_reaches_nothing_names_the_one_exception(spec: Path) -> None:
    """The default customer is reached by everybody, so an unqualified denial is false.

    This is the shape of the contradiction that survived a full end-to-end read: four
    statements said an analyst reaches no customer, and a fifth granted every analyst
    the default one.
    """
    body = spec.read_text()
    for line in body.splitlines():
        if re.search(r"reach(es)? no customer", line):
            if "wherever this specification says" in line.lower():
                continue  # the sentence that states the exception
            assert "default" in line.lower(), (
                f"{spec.parent.name}: {line.strip()!r} denies reach without excepting the "
                "default customer, which every analyst reaches."
            )


def test_the_constitution_and_the_injected_copy_carry_the_same_articles() -> None:
    """`config.yaml` is what reaches every generated artifact; the file is what is read."""
    articles = re.findall(r"^### ([IVX]+)\. (.+)$", CONSTITUTION.read_text(), flags=re.M)
    config = CONFIG.read_text()
    condensed = re.findall(r"^  ([IVX]+)\.\s+(.+)$", config, flags=re.M)
    assert [n for n, _ in articles] == [n for n, _ in condensed], (
        f"constitution has {[n for n, _ in articles]} and config.yaml has "
        f"{[n for n, _ in condensed]}. Changing an article means changing both."
    )

    #: The numeral matching proves nothing about the text under it. Each article's
    #: distinguishing noun must survive into the copy that is actually injected,
    #: or the two can say different things while numbering identically.
    for (numeral, title), (_, summary) in zip(articles, condensed):
        words = set(re.findall(r"[a-z0-9-]{4,}", title.lower()))
        window = config[config.index(summary) : config.index(summary) + 600].lower()
        assert words & set(re.findall(r"[a-z0-9-]{4,}", window)), (
            f"Article {numeral} is {title!r} in the constitution, and nothing under "
            f"{numeral}. in the injected copy shares a word with it. The two have drifted."
        )


def test_no_control_is_both_answered_and_a_gap() -> None:
    answered = {c for controls, _ in matrix_rows("Answered") for c in controls}
    gaps = {c for controls, _ in matrix_rows("Gaps") for c in controls}
    both = answered & gaps
    assert not both, f"the matrix lists {sorted(both)} as answered and as a gap"


def test_every_control_the_matrix_names_exists_in_the_standard() -> None:
    """A control identifier recalled rather than read is worse than an empty cell.

    The source is a fixture rather than something to fetch, and its absence fails
    rather than skips: a check that quietly stops running is the defect it exists
    to catch, one level up.
    """
    named = {c for section in ("Answered", "Gaps")
             for controls, _ in matrix_rows(section) for c in controls}
    assert named, "the matrix names no controls at all"
    source = MATRIX.parent / "asvs-5.0.0.csv"
    assert source.exists(), (
        f"{source.name} is missing, so {len(named)} control identifiers cannot be "
        "verified against the standard. Restore it rather than skipping the check."
    )
    real = {row["req_id"] for row in csv.DictReader(source.open())}
    unknown = named - real
    assert not unknown, f"the matrix names controls the standard does not have: {sorted(unknown)}"


def test_every_credit_names_a_requirement_that_exists() -> None:
    """A credit naming a capability proves nothing; it must name the requirement.

    `Accounts - every sign-in is logged` passes any prefix check even when no
    requirement says it. Citing the heading exactly means renaming a requirement
    breaks the row instead of orphaning it.
    """
    titles = requirement_titles()
    for controls, cell in matrix_rows("Answered"):
        credit = CREDIT.search(cell + "|")
        assert credit, f"{controls}: {cell.strip()!r} is not `capability :: Requirement title`"
        pair = (credit.group(1), credit.group(2))
        assert pair in titles, (
            f"{controls} credits {pair[0]}/{pair[1]!r}, which is not a requirement in that "
            "specification. Either the requirement moved or the row was written from memory."
        )


#: Specifications with no security surface, each named deliberately. A specification
#: is credited in the matrix unless it appears here, because the alternative -- looking
#: for a word like "security" in the prose -- goes inert against exactly the document
#: that avoids the word. That is how the API specification, which is almost entirely
#: about who may reach what, carried no credit and passed.
NO_SECURITY_SURFACE: dict[str, str] = {
    "interface": (
        "How the interface is built: layering, where controls come from, what a screen "
        "may do, and one vocabulary for colour and motion. Every security property an "
        "analyst meets through it -- what they may reach, what a refusal discloses, "
        "whether an action is attributed -- is decided by the specifications the "
        "interface calls, and stating it again here would be a second place to keep true."
    ),
}


def test_every_specification_is_credited_or_declared_to_have_no_security_surface() -> None:
    """The other direction: a specification the matrix cites nothing in."""
    cited = {CREDIT.search(cell + "|").group(1) for _, cell in matrix_rows("Answered")
             if CREDIT.search(cell + "|")}
    for spec in SPECS:
        name = spec.parent.name
        if name in NO_SECURITY_SURFACE:
            continue
        assert name in cited, (
            f"the matrix cites nothing in {name}. Either trace its security-bearing "
            f"requirements, or add it to NO_SECURITY_SURFACE with the reason it has none."
        )


def test_the_matrix_scope_line_names_the_chapters_it_actually_cites() -> None:
    """A scope statement drifts silently as rows are added, and reads as an audit boundary.

    Adding a chapter's controls without widening the sentence makes the matrix claim a
    narrower review than it performed; widening it without adding rows claims a broader
    one. Both mislead somebody asking what was checked.
    """
    body = MATRIX.read_text()
    cited = {c.split(".")[0] for section in ("Answered", "Gaps")
             for controls, _ in matrix_rows(section) for c in controls}
    scope = body[: body.index("## Answered")]
    claimed = set(re.findall(r"\b(V\d+) [A-Z]", scope))
    assert claimed == cited, (
        f"the matrix cites {sorted(cited, key=lambda v: int(v[1:]))} and its scope line "
        f"names {sorted(claimed, key=lambda v: int(v[1:]))}"
    )
