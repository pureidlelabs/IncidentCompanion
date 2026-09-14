"""The ledger's totals are generated from its rows, and generating them is idempotent.

**The header is derived data that lives in the file**, which is deliberate:
`tests/docs/test_scenario_ledger.py` records the reason -- the numbers are quoted
outside this repository, and one nobody can read without running a test is one
that gets recalled instead. What was not deliberate is that it was maintained by
hand.

**The rows merge and the header does not.** Two branches that each demonstrate a
scenario produce a merged file whose rows hold both changes and whose header
holds one of them, so the pair cannot land without somebody recounting in
between. Measured on 2026-09-13: that ejected one pull request from the merge
queue four times.

So the header is generated, the way any checked-in derived file is: readable in
the tree, rewritten by a command, and held to the rows by the test that already
compares them.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / ".claude" / "scripts" / "ledger_totals.py"
LEDGER = ROOT / "openspec" / "matrix" / "scenarios.md"

HEADER = ("Scenarios", "Demonstrated", "Undemonstrable", "Unbuilt", "Undemonstrated")


def run(*args: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        capture_output=True,
        text=True,
        cwd=cwd or ROOT,
        check=False,
    )


def stated(body: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for line in body.splitlines():
        parts = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(parts) == 2 and parts[0] in HEADER and parts[1].isdigit():
            out[parts[0]] = int(parts[1])
    return out


def counted(body: str) -> dict[str, int]:
    tally = {"demonstrated": 0, "undemonstrable": 0, "unbuilt": 0, "undemonstrated": 0}
    rows = 0
    for line in body.splitlines():
        if not line.startswith("| "):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) != 4 or cells[2] in ("Status", "---"):
            continue
        rows += 1
        tally[cells[2] or "undemonstrated"] += 1
    return {
        "Scenarios": rows,
        "Demonstrated": tally["demonstrated"],
        "Undemonstrable": tally["undemonstrable"],
        "Unbuilt": tally["unbuilt"],
        "Undemonstrated": tally["undemonstrated"],
    }


def test_the_script_is_there_and_runs() -> None:
    """A missing script would make every case below pass over nothing."""
    assert SCRIPT.exists(), f"{SCRIPT} is not in the tree"

    done = run()

    assert done.returncode == 0, done.stderr
    assert "scenarios" in done.stdout.lower(), f"printed no totals: {done.stdout!r}"


def test_it_prints_what_the_rows_say() -> None:
    """The four numbers stay answerable without editing anything."""
    body = LEDGER.read_text(encoding="utf-8")
    done = run()

    for label, number in counted(body).items():
        assert f"{label.lower()} {number}" in done.stdout.lower(), (
            f"the printed totals do not name {label} as {number}: {done.stdout!r}"
        )


def test_writing_leaves_the_header_agreeing_with_the_rows(tmp_path: Path) -> None:
    """The whole point: a drifted header is repaired by a command, not a count."""
    tree = tmp_path / "openspec" / "matrix"
    tree.mkdir(parents=True)
    body = LEDGER.read_text(encoding="utf-8")
    copy = tree / "scenarios.md"

    # Drift it the way a merge does: the rows carry both branches and the
    # header carries one, so every number is one out.
    drifted = body.replace(
        f"| Demonstrated | {counted(body)['Demonstrated']} |",
        f"| Demonstrated | {counted(body)['Demonstrated'] - 1} |",
        1,
    )
    assert drifted != body, "the fixture did not drift, so this asserts nothing"
    copy.write_text(drifted, encoding="utf-8")

    done = run("--write", "--ledger", str(copy))

    assert done.returncode == 0, done.stderr
    assert stated(copy.read_text(encoding="utf-8")) == counted(body), (
        "the header still disagrees with the rows after being written"
    )


def test_writing_twice_changes_nothing_the_second_time(tmp_path: Path) -> None:
    """Generated output that is not stable is a diff on every run."""
    copy = tmp_path / "scenarios.md"
    copy.write_text(LEDGER.read_text(encoding="utf-8"), encoding="utf-8")

    run("--write", "--ledger", str(copy))
    once = copy.read_text(encoding="utf-8")
    run("--write", "--ledger", str(copy))

    assert copy.read_text(encoding="utf-8") == once, "a second write moved the file again"


def test_it_refuses_a_file_holding_no_header(tmp_path: Path) -> None:
    """Writing nothing into the wrong file is worse than refusing it."""
    copy = tmp_path / "not-a-ledger.md"
    copy.write_text("# Nothing to count\n", encoding="utf-8")

    done = run("--write", "--ledger", str(copy))

    assert done.returncode != 0, "it rewrote a file that carries no totals"
    assert copy.read_text(encoding="utf-8") == "# Nothing to count\n", "it wrote anyway"


def test_the_tree_is_in_the_state_it_generates() -> None:
    """The checked-in header is what the command would write, so a diff means drift."""
    body = LEDGER.read_text(encoding="utf-8")

    assert stated(body) == counted(body), (
        "the ledger header disagrees with its rows -- run "
        ".claude/scripts/ledger_totals.py --write"
    )


@pytest.mark.parametrize("flag", ["--write", "--ledger"])
def test_the_flags_are_the_ones_the_prose_names(flag: str) -> None:
    """A command named in a failure message is a claim about that command."""
    assert flag in SCRIPT.read_text(encoding="utf-8"), f"{flag} is named nowhere in the script"
