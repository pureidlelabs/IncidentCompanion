"""`tests/certify.py`, over reports the installed runners really wrote.

Each case attacks one way a run can be called green while it certified less
than it says: a file that never ran, a skip nobody declared, a row citing a
path, a test that never reached the product, a landing that closes the issue an
`unbuilt` row still waits on.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

from tests import certify
from tests._ledger import rows
from tests._repo import REPO_ROOT

VITEST = REPO_ROOT / "node_modules" / ".bin" / "vitest"

pytestmark = pytest.mark.skipif(not VITEST.exists(), reason="the installed vitest writes the reports")


def lay_out(tree: Path, files: dict[str, str]) -> None:
    for path, body in files.items():
        (tree / path).parent.mkdir(parents=True, exist_ok=True)
        (tree / path).write_text(body, encoding="utf-8")


def vitest_report(tmp_path: Path, files: dict[str, str], tier: str = "server", shard: int | None = None) -> Path:
    """The reports directory after the installed vitest ran `files`, or one shard of two."""
    tree, reports = tmp_path / "tree", tmp_path / "reports"
    lay_out(tree, files)
    reports.mkdir(exist_ok=True)
    out = reports / f"{tier}-{shard or 1}.json"
    subprocess.run(  # noqa: S603
        [str(VITEST), "run", "--root", str(tree), "--globals", "--reporter=json",
         f"--outputFile.json={out}", *([f"--shard={shard}/2"] if shard else [])],
        cwd=tree, capture_output=True, text=True, timeout=120, check=False,
    )
    assert out.exists(), f"vitest wrote no report for {sorted(files)}"
    return reports


def junit_report(tmp_path: Path, files: dict[str, str], tier: str = "repository") -> Path:
    """The reports directory after pytest ran `files` into a junit report."""
    tree, reports = tmp_path / "tree", tmp_path / "reports"
    lay_out(tree, files)
    reports.mkdir(exist_ok=True)
    out = reports / f"{tier}.xml"
    subprocess.run(  # noqa: S603
        [sys.executable, "-m", "pytest", *files, f"--rootdir={tree}", "-p", "no:cacheprovider",
         "-p", "no:xdist", f"--junitxml={out}", "-q"],
        cwd=tree, capture_output=True, text=True, timeout=120, check=False,
        env={**os.environ, "PYTEST_ADDOPTS": ""},
    )
    assert out.exists(), f"pytest wrote no report for {sorted(files)}"
    return reports


PASSES = "it('holds', () => { expect(1).toBe(1) })\n"


def test_a_test_file_no_report_holds_is_refused(tmp_path: Path) -> None:
    files = {"server/test/a.test.ts": PASSES, "server/test/b.test.ts": PASSES}
    reports = vitest_report(tmp_path, files, shard=1)

    refused = certify.completeness(certify.read(reports, set(files)), list(files), partial=False)

    assert len(refused) == 1 and "the server tier's reports do not hold it" in refused[0], refused
    vitest_report(tmp_path, files, shard=2)
    assert certify.completeness(certify.read(reports, set(files)), list(files), partial=False) == []


def test_a_tier_that_wrote_no_report_and_a_file_nobody_owns_are_refused(tmp_path: Path) -> None:
    files = {"server/test/a.test.ts": PASSES}
    reports = vitest_report(tmp_path, files)
    tracked = [*files, "ui/src/owed.test.tsx", "somewhere/test_orphan.py", "server/e2e/walk.spec.ts"]

    refused = certify.completeness(certify.read(reports, set(tracked)), tracked, partial=False)

    assert any("ui/src/owed.test.tsx: the client tier wrote no report" in one for one in refused), refused
    assert any("somewhere/test_orphan.py is named like a test and no tier owns it" in one for one in refused)
    assert not any("walk.spec.ts" in one for one in refused), "an UNREAD path was refused"
    assert not any("owed.test.tsx" in one for one in certify.completeness(
        certify.read(reports, set(tracked)), tracked, partial=True)), "a partial run refused an absent tier"


def test_a_file_whose_every_case_skipped_is_not_counted_as_run(tmp_path: Path) -> None:
    files = {"server/test/idle.test.ts": "it.skip('waits', () => {})\n"}
    run = certify.read(vitest_report(tmp_path, files), set(files))

    assert certify.skips(run) == [
        "server/test/idle.test.ts :: waits: skipped, and ALLOWED_SKIPS gives no reason it may be"
    ]


def test_a_skip_in_a_certifying_report_is_refused_unless_allowed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    files = {
        "server/test/s.test.ts": (
            "describe('a door', () => {\n"
            "  it.skip('waits for a stack', () => {})\n"
            "  it.todo('is written later')\n"
            "  it('runs', () => {})\n"
            "})\n"
        )
    }
    run = certify.read(vitest_report(tmp_path, files), set(files))
    waits = "server/test/s.test.ts :: a door > waits for a stack"
    later = "server/test/s.test.ts :: a door > is written later"
    runs = "server/test/s.test.ts :: a door > runs"

    assert {line.rsplit(": skipped", 1)[0] for line in certify.skips(run)} == {waits, later}

    monkeypatch.setattr(certify, "ALLOWED_SKIPS", {waits: "needs a compose project"})
    assert [line.rsplit(": skipped", 1)[0] for line in certify.skips(run)] == [later]

    monkeypatch.setattr(certify, "ALLOWED_SKIPS", {waits: "needs a compose project", runs: "was flaky"})
    assert any(line.startswith(f"{runs}: ran") for line in certify.skips(run)), certify.skips(run)


def test_a_skip_in_a_junit_report_is_read_as_one(tmp_path: Path) -> None:
    files = {
        "tests/docs/test_probe.py": (
            "import pytest\n"
            "def test_holds():\n    assert True\n"
            "def test_waits():\n    pytest.skip('no stack')\n"
            "class TestGroup:\n    def test_inside(self):\n        assert True\n"
        )
    }
    run = certify.read(junit_report(tmp_path, files), set(files))

    assert {ident: case.status for ident, case in run.cases.items()} == {
        "tests/docs/test_probe.py :: test_holds": "passed",
        "tests/docs/test_probe.py :: test_waits": "skipped",
        "tests/docs/test_probe.py :: TestGroup > test_inside": "passed",
    }
    assert run.ran == {"repository": {"tests/docs/test_probe.py"}}


DROVE = (
    "describe('the door', () => {\n"
    "  it('was served', ({ task }) => { task.meta.served = true })\n"
    "  it('was called by hand', () => {})\n"
    "  it('went wrong', ({ task }) => { task.meta.served = true; expect(1).toBe(2) })\n"
    "})\n"
)


def demonstrated(evidence: str, capability: str = "cases") -> certify.Row:
    return (capability, "A requirement", "A scenario", "demonstrated", evidence)


def test_a_row_citing_a_path_rather_than_a_test_is_refused(tmp_path: Path) -> None:
    files = {"server/test/door.test.ts": DROVE}
    reports = vitest_report(tmp_path, files)
    ledger = [demonstrated("server/test/door.test.ts"), demonstrated("README.md")]

    refused, counted = certify.certify(reports, set(), False, list(files), ledger)

    assert refused == [
        "cases: 'A scenario' cites server/test/door.test.ts rather than a test in it",
        "cases: 'A scenario' cites README.md rather than a test in it",
    ]
    assert counted["demonstrated"] == 0


def test_a_cited_test_below_the_entry_point_is_refused(tmp_path: Path) -> None:
    files = {"server/test/door.test.ts": DROVE}
    reports = vitest_report(tmp_path, files)
    served = "server/test/door.test.ts :: the door > was served"
    by_hand = "server/test/door.test.ts :: the door > was called by hand"
    wrong = "server/test/door.test.ts :: the door > went wrong"
    absent = "server/test/door.test.ts :: the door > was never written"
    ledger = [
        demonstrated(served),
        demonstrated(by_hand),
        demonstrated(f"{served} ; {by_hand}"),
        demonstrated(wrong),
        demonstrated(absent),
    ]

    refused, counted = certify.certify(reports, set(), False, list(files), ledger)

    assert refused == [
        f"cases: 'A scenario' cites {by_hand}, which never reached the product through its entry point",
        f"cases: 'A scenario' cites {by_hand}, which never reached the product through its entry point",
        f"cases: 'A scenario' cites {wrong}, which failed",
        f"cases: 'A scenario' cites {absent}, which no report holds",
    ]
    assert counted["demonstrated"] == 1


def test_a_repository_check_never_demonstrates_a_scenario(tmp_path: Path) -> None:
    files = {"tests/repo/test_sweep.py": "def test_every_file_says_so():\n    assert True\n"}
    reports = junit_report(tmp_path, files)

    refused, _ = certify.certify(
        reports, set(), False, list(files), [demonstrated("tests/repo/test_sweep.py :: test_every_file_says_so")]
    )

    assert refused == [
        "cases: 'A scenario' cites tests/repo/test_sweep.py :: test_every_file_says_so, "
        "which never reached the product through its entry point"
    ]


def test_the_four_numbers_count_only_what_the_run_certified(tmp_path: Path) -> None:
    files = {"server/test/door.test.ts": DROVE}
    reports = vitest_report(tmp_path, files)
    ledger = [
        demonstrated("server/test/door.test.ts :: the door > was served"),
        demonstrated("server/test/door.test.ts :: the door > went wrong"),
        ("cases", "R", "S", "unbuilt", "nothing yet"),
        ("cases", "R", "S", "undemonstrable", "an operator is told"),
        ("cases", "R", "S", "", ""),
    ]

    _, counted = certify.certify(reports, set(), False, list(files), ledger)

    assert counted == {
        "scenarios": 5, "undemonstrated": 1, "demonstrated": 1, "undemonstrable": 1,
        "unbuilt": 1, "uncertified here": 0,
    }


def test_a_merge_closing_an_issue_an_unbuilt_row_cites_is_refused() -> None:
    ledger = rows(certify.LEDGER)
    cited = sorted({
        int(number)
        for _, _, _, status, reason in ledger
        if status == "unbuilt"
        for number in re.findall(r"#(\d+)", reason)
    })
    assert cited, "no unbuilt row cites an issue, so this case refuses nothing"

    for number in cited:
        refused = certify.unbuilt_closed(ledger, {number})
        assert refused and all(f"#{number}" in line for line in refused), number

    assert certify.unbuilt_closed(ledger, {max(cited) + 100000}) == []
