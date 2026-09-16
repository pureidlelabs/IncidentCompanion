# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only

"""Every script under `server/` is named somewhere a person would look.

**A place that sends somebody there**, not any file holding the string: a port
literal quoted in another test is a mention rather than a route to running it.
What follows from a script nothing names is a choice rather than a rule -- give
it a caller, or delete it. -> #656
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from tests._repo import REPO_ROOT

SERVER = REPO_ROOT / "server"

#: What a script is, wherever it sits.
RUNNABLE = {".ts", ".mts", ".mjs", ".js", ".sh"}

#: Walked by their own rules, not this one.
OWN_RULES = {"src", "test", "e2e", "node_modules", "dist", ".visual"}

#: Where naming a probe sends somebody to run it.
def _places() -> list[Path]:
    return [
        *(REPO_ROOT / ".claude" / "skills").rglob("*.md"),
        *(REPO_ROOT / ".claude").glob("*.md"),
        *(REPO_ROOT / ".github" / "workflows").glob("*.yml"),
        # The tier that runs the operational scripts, which is the place a
        # person looking for one arrives from.
        *(REPO_ROOT / "tests" / "docker").glob("*.py"),
        REPO_ROOT / "README.md",
        REPO_ROOT / "ui" / "README.md",
        SERVER / "package.json",
        REPO_ROOT / "package.json",
        REPO_ROOT / "ui" / "package.json",
    ]


def _probes() -> list[Path]:
    """Every script that ships under `server/`, dotfiles included."""
    under_scripts = [
        one for one in (SERVER / "scripts").rglob("*")
        if one.is_file() and one.suffix in RUNNABLE
    ]
    # The dotfiles at the package root, which is where three unnamed ones sat.
    dotfiles = [
        one for one in SERVER.glob(".*")
        if one.is_file() and one.suffix in RUNNABLE
    ]
    return sorted(under_scripts + dotfiles)


def _names(probe: Path) -> list[str]:
    """Which of the places name this probe, as a word rather than a substring."""
    # A path separator may precede it; a word character or a dash may not, so a
    # shorter basename never names the longer one it is a tail of.
    token = re.compile(rf"(?<![\w-]){re.escape(probe.name)}(?![\w-])")
    return [
        str(place.relative_to(REPO_ROOT))
        for place in _places()
        if place.exists() and token.search(place.read_text(encoding="utf-8"))
    ]


def test_every_probe_is_named_where_somebody_would_look():
    unnamed = [str(one.relative_to(REPO_ROOT)) for one in _probes() if not _names(one)]

    assert not unnamed, (
        "these scripts are named by no npm script, skill, workflow or README, so "
        "nobody would find them -- give each a caller or delete it:\n  "
        + "\n  ".join(unnamed))


def test_every_probe_script_runs_a_file_that_exists():
    """A probe deleted out from under its own npm script is a red herring."""
    scripts: dict[str, str] = json.loads(
        (SERVER / "package.json").read_text(encoding="utf-8"))["scripts"]

    missing = [
        f"{name} -> {ran}"
        for name, command in scripts.items()
        if name.startswith("probe:")
        for ran in re.findall(r"(scripts/[\w./-]+)", command)
        if not (SERVER / ran).exists()
    ]

    assert not missing, f"these probe scripts run a file that is not there: {missing}"


def test_it_is_looking_at_the_probes():
    """A run that found no probes would pass over a directory that had moved."""
    probes = _probes()

    assert len(probes) > 10, f"only {len(probes)} scripts found under server/"
    assert any(one.name == "stack.mjs" for one in probes), (
        "stack.mjs is gone from server/scripts, so this is walking the wrong place")
