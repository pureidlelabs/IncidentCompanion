# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only

"""Every script under `server/` is named by something that is not itself.

A probe nobody can find is a probe nobody runs. The instruments in
`server/scripts/` exist because the suites structurally cannot see what they
measure -- a missing PDF glyph is a tofu box rather than an error, and the
`.docx` tests read the zip's part names rather than asking whether Word opens
the file -- so losing one is losing the only way to ask.

**Named, not merely present.** The test is whether somebody would find it: an
npm script, a skill, a README, or a test's failure message. A usage line in the
probe's own header is not that, because it is only read once the file is open.

What follows from a probe that nothing names is a choice rather than a rule:
give it a caller, or delete it while `gh release list` is empty. -> #656

**Build output is not a caller.** `dist/` and `*.tsbuildinfo` list every file
the compiler touched, and a minified bundle contains the word `backup` for
reasons of its own -- both answer "named" for everything and would make this
test green over a tree nobody had wired up.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

from tests._repo import REPO_ROOT

SCRIPTS = REPO_ROOT / "server" / "scripts"

#: Not a caller: generated, vendored, or the lock file.
BLIND = [
    "--exclude-dir=node_modules",
    "--exclude-dir=.git",
    "--exclude-dir=dist",
    "--exclude-dir=__pycache__",
    "--exclude-dir=.venv",
    "--exclude=package-lock.json",
    "--exclude=*.tsbuildinfo",
]


def _probes() -> list[Path]:
    """Every script that ships under `server/`, dotfiles at its root included."""
    return sorted(
        [one for one in SCRIPTS.iterdir() if one.is_file()]
        + list((REPO_ROOT / "server").glob(".*.mjs")),
    )


def _named_by(probe: Path) -> list[str]:
    """Which files mention this probe by name, the probe itself aside."""
    found = subprocess.run(
        ["grep", "-rl", probe.name, *BLIND, "."],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    ).stdout.split()
    return [one for one in found if Path(one).name != probe.name]


def test_every_probe_is_named_by_something_other_than_itself():
    unnamed = [
        str(probe.relative_to(REPO_ROOT)) for probe in _probes() if not _named_by(probe)
    ]

    assert not unnamed, (
        "these scripts are named by nothing, so nobody would find them -- give "
        "each an npm script in server/package.json, a line in the skill that "
        "would send somebody to it, or delete it:\n  " + "\n  ".join(unnamed))


def test_it_is_looking_at_the_probes():
    """A run that found no probes would pass over a directory that had moved."""
    probes = _probes()

    assert len(probes) > 10, f"only {len(probes)} scripts found under server/"
    assert any(one.name == "stack.mjs" for one in probes), (
        "stack.mjs is gone from server/scripts, so this is walking the wrong place")
