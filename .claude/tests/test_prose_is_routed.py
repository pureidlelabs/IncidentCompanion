"""A prose change has to be told to run the prose linter.

**Vale is not in `./test.sh`**, which runs in a shell with no Go binary. CI's
`lint` job does run it, behind a path gate: `WANT_PROSE` decides whether
`npm run --silent lint:prose` executes at all, so a branch the gate reads as
prose-free is a branch nothing lints. Before the pull request, the only thing
that runs it is a person following `test_scope.py` or the `land` skill.

`tests/docs/test_vale_config.py` asserts the rules are awake. This asserts somebody
is told to point them at the prose.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / ".claude" / "scripts" / "test_scope.py"

sys.path.insert(0, str(ROOT / ".claude" / "scripts"))
from test_scope import touches_prose  # noqa: E402


#: Every tree `.vale.ini` scopes, and the rules themselves.
#:
#: **These are glob probes, not files, and need not exist.** `touches_prose`
#: matches strings against `.vale.ini`'s sections and never reaches the disk,
#: so a path here asserts what the globs cover rather than what the tree holds.
#: One that names a real file is a coincidence of choosing a readable example.
LINTED = [
    "openspec/constitution.md",
    "README.md",
    ".claude/CLAUDE.md",
    ".claude/rules/writing-style.md",
    ".claude/skills/land/references/some-note.md",
    ".claude/skills/land/SKILL.md",
    # A rule edit re-lints every file, not only the one in the diff.
    ".vale.ini",
    ".vale/styles/Shared/Filler.yml",
    ".vale/styles/config/vocabularies/IncidentCompanion/accept.txt",
]

#: Changes Vale reads nothing of. A detector that fires on these is one that
#: gets ignored, which is the same outcome as not existing.
NOT_LINTED = [
    "server/src/openapi.ts",
    "ui/src/app/RouteError.tsx",
    "tests/docs/test_vale_config.py",
    ".claude/scripts/test_scope.py",
    ".claude/hooks/stop_nudge.py",
    "compose.yaml",
]


@pytest.mark.parametrize("path", LINTED)
def test_a_prose_change_is_routed_to_the_linter(path: str) -> None:
    assert touches_prose([path]), (
        f"{path} is linted by Vale but `test_scope.py` would not say so, "
        "so nothing tells anyone to run it."
    )


@pytest.mark.parametrize("path", NOT_LINTED)
def test_a_code_change_is_not(path: str) -> None:
    assert not touches_prose([path]), (
        f"{path} holds no prose Vale reads; routing it there trains the reader "
        "to skip the line."
    )


def test_the_router_prints_the_command_a_person_can_run() -> None:
    """The wording, because an instruction nobody can execute is not one.

    The script is run first, so a detector that fires from a script that
    crashes fails here rather than passing on the emitter alone.
    """
    done = subprocess.run(
        [sys.executable, str(SCRIPT), "HEAD~1..HEAD"],
        cwd=str(ROOT), capture_output=True, text=True,
    )
    assert done.returncode == 0, done.stderr

    # **The quotes are part of the anchor.** Matched bare, this finds the same
    # words inside the comment explaining why the emitter exists, so deleting
    # the emitter and keeping the comment leaves it green -- the exact failure
    # this file is about.
    source = SCRIPT.read_text()
    assert '"npm run lint:prose"' in source, (
        "test_scope.py no longer prints the prose command, so the detector "
        "decides something nobody is told about."
    )


def test_the_command_it_names_is_the_one_that_exists() -> None:
    import json

    package = json.loads((ROOT / "package.json").read_text())
    assert "lint:prose" in package.get("scripts", {}), (
        "package.json has no lint:prose script, so the routed command fails"
    )
