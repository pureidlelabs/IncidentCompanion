"""`audit.py` is driven as a real process, because that is how it is used.

Importing the checks and calling them would pass over a crash on the first
line of output. Every test here plants a defect in a scratch memory directory
and asserts the process reports it.
"""
import pathlib
import subprocess
import sys

import pytest

AUDIT = pathlib.Path(__file__).resolve().parents[1] / "skills" / "memory-hygiene" / "audit.py"
REPO = pathlib.Path(__file__).resolve().parents[2]

MEMORY = """\
---
name: {name}
description: a memory
metadata:
  type: project
---

{body}
"""


def _run(memory: pathlib.Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(AUDIT), str(REPO), "--memory-dir", str(memory), *args],
        capture_output=True,
        text=True,
    )


@pytest.fixture
def memory(tmp_path: pathlib.Path) -> pathlib.Path:
    """A clean directory the audit should have nothing to say about."""
    (tmp_path / "kept.md").write_text(
        MEMORY.format(name="kept", body="`server/src/db/mutate.ts` is the only case write path.")
    )
    (tmp_path / "MEMORY.md").write_text("- [Kept](kept.md) — a hook\n")
    return tmp_path


def test_a_clean_memory_directory_passes(memory: pathlib.Path):
    result = _run(memory)
    assert result.returncode == 0, result.stdout


def test_an_empty_directory_is_an_error_and_not_a_pass(memory: pathlib.Path):
    """The check that could not fail otherwise.

    Every check is a loop over the files, so a glob matching nothing exits 0
    with a zero beside each one and reads as a clean sweep.
    """
    (memory / "kept.md").unlink()
    result = _run(memory)
    assert result.returncode != 0
    assert "no memory files found" in result.stderr


def test_a_path_that_no_longer_exists_is_reported(memory: pathlib.Path):
    (memory / "kept.md").write_text(
        MEMORY.format(name="kept", body="`app/sentinel_client.py` does the import.")
    )
    result = _run(memory)
    assert "app/sentinel_client.py" in result.stdout
    assert result.returncode == 1


def test_a_path_named_as_prose_is_not_reported(memory: pathlib.Path):
    """`case.json` and `AppState.mutate` are backticked all over the memories.

    Requiring a leading repo directory is the whole filter; without it the
    PATH check reports every filename anyone mentions and stops being read.
    """
    (memory / "kept.md").write_text(
        MEMORY.format(name="kept", body="`case.json` is written by `AppState.flush`.")
    )
    assert _run(memory).returncode == 0


def test_a_commit_that_is_not_in_this_repo_is_reported(memory: pathlib.Path):
    (memory / "kept.md").write_text(
        MEMORY.format(name="kept", body="Landed in `deadbee` on the release branch.")
    )
    result = _run(memory)
    assert "deadbee" in result.stdout
    assert result.returncode == 1


def test_a_file_missing_from_the_index_is_reported(memory: pathlib.Path):
    (memory / "orphan.md").write_text(MEMORY.format(name="orphan", body="unreachable."))
    result = _run(memory)
    assert "orphan.md" in result.stdout
    assert result.returncode == 1


def test_an_index_entry_pointing_at_nothing_is_reported(memory: pathlib.Path):
    (memory / "MEMORY.md").write_text(
        "- [Kept](kept.md) — a hook\n- [Gone](gone.md) — deleted without its line\n"
    )
    result = _run(memory)
    assert "gone.md" in result.stdout
    assert result.returncode == 1


def test_frontmatter_naming_another_file_is_reported(memory: pathlib.Path):
    (memory / "kept.md").write_text(MEMORY.format(name="renamed", body="a fact."))
    result = _run(memory)
    assert "renamed" in result.stdout
    assert result.returncode == 1


def test_a_dangling_link_is_reported_and_does_not_gate(memory: pathlib.Path):
    """A `[[name]]` with no file is legal -- it marks a memory worth writing.

    Gating on it would make the audit's exit status disagree with the
    instructions memories are written under.
    """
    (memory / "kept.md").write_text(
        MEMORY.format(name="kept", body="See [[not-written-yet]].")
    )
    result = _run(memory)
    assert "not-written-yet" in result.stdout
    assert result.returncode == 0
