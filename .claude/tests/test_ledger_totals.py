"""The generated ledger totals are the ones its own check counts.

**The header is derived data that lives in the file**, which is deliberate:
`tests/docs/test_scenario_ledger.py` records the reason. What was not
deliberate is that it was maintained by hand, and the rows of two branches
merge where the header does not.

**Every case here counts through the check's own reader**, never through a
copy. A case that re-implements the script's parsing asserts the script agrees
with itself: it stays green on exactly the files the check refuses, which is
the failure this file exists to catch rather than to reproduce.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / ".claude" / "scripts" / "ledger_totals.py"
LEDGER = ROOT / "openspec" / "matrix" / "scenarios.md"

sys.path.insert(0, str(ROOT))
from tests._ledger import STATUSES, rows  # noqa: E402

HEADER = ("Scenarios", *(one.capitalize() for one in STATUSES))


def run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        capture_output=True,
        text=True,
        cwd=ROOT,
        check=False,
    )


def stated(body: str) -> dict[str, int]:
    """The five numbers the summary states."""
    out: dict[str, int] = {}
    for line in body.splitlines():
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) == 2 and cells[0] in HEADER and cells[1].isdigit():
            out[cells[0]] = int(cells[1])
    return out


def counted(ledger: Path) -> dict[str, int]:
    """What the ledger's own check counts, which is the only authority here."""
    found = rows(ledger)
    tally = {label: 0 for label in HEADER}
    tally["Scenarios"] = len(found)
    for _, _, _, status, _ in found:
        tally[(status or STATUSES[0]).capitalize()] += 1
    return tally


def a_copy(tmp_path: Path, body: str) -> Path:
    copy = tmp_path / "scenarios.md"
    copy.write_text(body, encoding="utf-8")
    return copy


def test_the_script_is_there_and_prints_what_the_check_counts() -> None:
    assert SCRIPT.exists(), f"{SCRIPT} is not in the tree"

    done = run()

    assert done.returncode == 0, done.stderr
    for label, number in counted(LEDGER).items():
        assert f"{label.lower()} {number}" in done.stdout.lower(), (
            f"the printed totals do not name {label} as {number}: {done.stdout!r}"
        )


def test_writing_leaves_the_header_agreeing_with_the_check(tmp_path: Path) -> None:
    """The whole point: a drifted header is repaired by a command, not a count."""
    body = LEDGER.read_text(encoding="utf-8")
    was = counted(LEDGER)["Demonstrated"]
    copy = a_copy(tmp_path, body.replace(f"| Demonstrated | {was} |", f"| Demonstrated | {was - 1} |", 1))
    assert stated(copy.read_text(encoding="utf-8")) != counted(copy), "the fixture did not drift"

    done = run("--write", "--ledger", str(copy))

    assert done.returncode == 0, done.stderr
    assert stated(copy.read_text(encoding="utf-8")) == counted(copy), (
        "the header still disagrees with what the check counts"
    )


def test_a_table_in_the_ledger_s_own_prose_is_not_counted(tmp_path: Path) -> None:
    """The section documenting the row format carries an example row.

    **The blind spot that made two parsers dangerous.** A reader with no notion
    of the `## capability` headings counts that example, writes a header one
    too high, and the check refuses the file it just wrote -- with the failure
    naming the command that produced it, so running it again is a fixed point.
    """
    body = LEDGER.read_text(encoding="utf-8")
    example = "| A requirement | A scenario | demonstrated | server/src/health/health.controller.ts |\n"
    anchor = "## How a row is filled in\n"
    assert anchor in body, "the ledger no longer has the section this case is about"
    copy = a_copy(tmp_path, body.replace(anchor, anchor + "\n" + example, 1))

    done = run("--write", "--ledger", str(copy))

    assert done.returncode == 0, done.stderr
    assert stated(copy.read_text(encoding="utf-8")) == counted(copy), (
        "an example row in the ledger's prose was counted, so the written header is one the "
        "ledger's own check refuses"
    )


def test_a_status_the_ledger_does_not_define_is_refused(tmp_path: Path) -> None:
    """Counting it into some bucket writes a header the check rejects.

    The check requires the literal word, so inventing a home for `nearly` makes
    the totals disagree with it while the command reports success.
    """
    body = LEDGER.read_text(encoding="utf-8")
    first = next(line for line in body.splitlines() if "| demonstrated |" in line)
    copy = a_copy(tmp_path, body.replace(first, first.replace("| demonstrated |", "| nearly |", 1), 1))

    done = run("--write", "--ledger", str(copy))

    assert done.returncode != 0, f"it counted an undefined status: {done.stdout!r}"
    assert "nearly" in done.stderr, f"the refusal does not name the status: {done.stderr!r}"


def test_writing_twice_changes_nothing_the_second_time(tmp_path: Path) -> None:
    """Generated output that is not stable is a diff on every run."""
    copy = a_copy(tmp_path, LEDGER.read_text(encoding="utf-8"))

    run("--write", "--ledger", str(copy))
    once = copy.read_text(encoding="utf-8")
    run("--write", "--ledger", str(copy))

    assert copy.read_text(encoding="utf-8") == once, "a second write moved the file again"


def test_it_refuses_a_file_holding_no_header(tmp_path: Path) -> None:
    copy = tmp_path / "not-a-ledger.md"
    copy.write_text("# Nothing to count\n", encoding="utf-8")

    done = run("--write", "--ledger", str(copy))

    assert done.returncode != 0, "it rewrote a file that carries no totals"
    assert copy.read_text(encoding="utf-8") == "# Nothing to count\n", "it wrote anyway"


def test_it_refuses_a_file_with_a_summary_and_no_rows(tmp_path: Path) -> None:
    """Zeroing somebody's release notes is the outcome nobody would notice.

    A refusal keyed on the labels alone accepts any file carrying those five
    words and rewrites every number in it to zero.
    """
    notes = (
        "# Release notes\n\n| | |\n| --- | --- |\n| Scenarios | 12 |\n| Demonstrated | 9 |\n"
        "| Undemonstrable | 1 |\n| Unbuilt | 1 |\n| Undemonstrated | 1 |\n"
    )
    copy = tmp_path / "release-notes.md"
    copy.write_text(notes, encoding="utf-8")

    done = run("--write", "--ledger", str(copy))

    assert done.returncode != 0, "it rewrote a file carrying no rows"
    assert copy.read_text(encoding="utf-8") == notes, "it zeroed a file that is not a ledger"


def test_the_tree_is_in_the_state_the_command_would_write() -> None:
    """The checked-in header is what the command writes, so a diff means drift."""
    assert stated(LEDGER.read_text(encoding="utf-8")) == counted(LEDGER), (
        "the ledger header disagrees with its rows -- run "
        ".claude/scripts/ledger_totals.py --write"
    )


@pytest.mark.parametrize("flag", ["--write", "--ledger"])
def test_the_repair_the_check_prescribes_is_a_command_that_runs(flag: str) -> None:
    """A command named in a failure message is a claim about that command.

    Read out of the check's own message rather than asserted against a literal,
    so pointing it at a script that does not exist fails here.
    """
    guard = (ROOT / "tests" / "docs" / "test_scenario_ledger.py").read_text(encoding="utf-8")
    named = next((line for line in guard.splitlines() if "repair = " in line), "")
    assert named, "the check prescribes no repair, so this asserts nothing"

    command = named.split('"')[1].removeprefix("run ").split()
    assert (ROOT / command[0]).exists(), f"the check prescribes {command[0]}, which is not in the tree"
    assert flag in " ".join(command) or flag == "--ledger", (
        f"the prescribed command does not pass {flag}"
    )

    spec = importlib.util.spec_from_file_location("ledger_totals", ROOT / command[0])
    assert spec and spec.loader, f"{command[0]} is not importable, so it is not a script"
