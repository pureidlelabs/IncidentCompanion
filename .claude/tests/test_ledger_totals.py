"""The ledger's totals are counted on demand, and counted the way its check counts.

**Every case here counts through the check's own reader**, never through a
copy. A case that re-implements the script's parsing asserts the script agrees
with itself: it stays green on exactly the files the check refuses, which is
the failure this file exists to catch rather than to reproduce.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

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


def counted(ledger: Path) -> dict[str, int]:
    """What the ledger's own check counts, which is the only authority here."""
    found = rows(ledger)
    tally = {label: 0 for label in HEADER}
    tally["Scenarios"] = len(found)
    for _, _, _, status, _ in found:
        tally[(status or STATUSES[0]).capitalize()] += 1
    return tally


def printed(stdout: str) -> dict[str, int]:
    words = stdout.split()
    return {label: int(words[words.index(label.lower()) + 1]) for label in HEADER}


def a_copy(tmp_path: Path, body: str) -> Path:
    copy = tmp_path / "scenarios.md"
    copy.write_text(body, encoding="utf-8")
    return copy


def test_the_script_is_there_and_prints_what_the_check_counts() -> None:
    assert SCRIPT.exists(), f"{SCRIPT} is not in the tree"

    done = run()

    assert done.returncode == 0, done.stderr
    assert printed(done.stdout) == counted(LEDGER), (
        f"the printed totals are not what the check counts: {done.stdout!r}"
    )


def test_a_table_in_the_ledger_s_own_prose_is_not_counted(tmp_path: Path) -> None:
    """The section documenting the row format carries an example row.

    **The blind spot that made two parsers dangerous.** A reader with no notion
    of the `## capability` headings counts that example and answers one too
    high, against a file the check finds correct.
    """
    body = LEDGER.read_text(encoding="utf-8")
    example = "| A requirement | A scenario | demonstrated | server/src/health/health.controller.ts |\n"
    anchor = "## How a row is filled in\n"
    assert anchor in body, "the ledger no longer has the section this case is about"
    copy = a_copy(tmp_path, body.replace(anchor, anchor + "\n" + example, 1))

    done = run("--ledger", str(copy))

    assert done.returncode == 0, done.stderr
    assert printed(done.stdout) == counted(copy), (
        "an example row in the ledger's prose was counted, so the answer is one the ledger's "
        "own check disagrees with"
    )


def test_a_status_the_ledger_does_not_define_is_refused(tmp_path: Path) -> None:
    """Counting it into some bucket answers for a row the check refuses."""
    body = LEDGER.read_text(encoding="utf-8")
    first = next(line for line in body.splitlines() if "| demonstrated |" in line)
    copy = a_copy(tmp_path, body.replace(first, first.replace("| demonstrated |", "| nearly |", 1), 1))

    done = run("--ledger", str(copy))

    assert done.returncode != 0, f"it counted an undefined status: {done.stdout!r}"
    assert "nearly" in done.stderr, f"the refusal does not name the status: {done.stderr!r}"


def test_it_refuses_a_file_carrying_no_rows(tmp_path: Path) -> None:
    """Printing zeroes for the wrong file is the one answer nobody checks."""
    copy = tmp_path / "not-a-ledger.md"
    copy.write_text("# Nothing to count\n", encoding="utf-8")

    done = run("--ledger", str(copy))

    assert done.returncode != 0, f"it answered for a file with no rows: {done.stdout!r}"


def test_the_command_the_check_names_is_one_that_runs() -> None:
    """A command named in a failure message is a claim about that command."""
    guard = (ROOT / "tests" / "docs" / "test_scenario_ledger.py").read_text(encoding="utf-8")
    named = set(re.findall(r"\.claude/scripts/\S+\.py", guard))
    assert named, "the check names no command, so a reader who trips it is told nothing"
    for command in named:
        assert (ROOT / command).exists(), f"the check names {command}, which is not in the tree"
