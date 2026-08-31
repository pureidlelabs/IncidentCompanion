# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only

"""`scripts/venv_python.sh`: which interpreter a tree runs its tools with.

**The failure this exists for cannot be seen by any other test**: a worktree
created on macOS carries a `.venv` whose `bin/python` points into
`/opt/homebrew`, and inside the dev container that symlink dangles. `./test.sh`
died on `.venv/bin/python: No such file or directory` in a tree where `.venv`
plainly exists -- and the main checkout's `.venv` is a named volume, so it is
Linux-native and was usable the whole time.

The resolver is a script rather than a few lines inside `test.sh` precisely so
these cases can be driven: the callers are shell entry points nothing imports.

Fabricated interpreters throughout -- a `bin/python` that is a shell script, or
a symlink into nowhere. The check under test is *executes*, not *exists*, and
those two only disagree on a file no `-f` test can tell apart from a good one.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest
from tests._repo import REPO_ROOT

REPO = REPO_ROOT
RESOLVER = REPO / "scripts" / "venv_python.sh"


def _run(cwd: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(RESOLVER), *args],
        cwd=cwd, capture_output=True, text=True,
    )


def _git(cwd: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


def _repo(root: Path) -> Path:
    """A real repository, because the resolver asks git whether it is in a worktree."""
    root.mkdir(parents=True, exist_ok=True)
    _git(root, "init", "-q", "-b", "main")
    _git(root, "config", "user.email", "t@example.invalid")
    _git(root, "config", "user.name", "t")
    (root / "README").write_text("x\n")
    _git(root, "add", "README")
    _git(root, "commit", "-qm", "init")
    return root


def _working_venv(tree: Path) -> Path:
    """A `.venv` whose interpreter runs. Its *contents* are irrelevant here."""
    py = tree / ".venv" / "bin" / "python"
    py.parent.mkdir(parents=True, exist_ok=True)
    py.write_text("#!/bin/sh\nexit 0\n")
    py.chmod(0o755)
    return py


def _foreign_venv(tree: Path) -> Path:
    """What a macOS venv looks like from inside the container: a dangling symlink.

    **The target must not exist on the host running the test**, which is the
    whole property: the symlink has to dangle for `must not win by existing` to
    mean anything. Spelled with a real Homebrew path, this passed in the
    container and failed on the machine it describes -- macOS has that
    interpreter, so the resolver ran it, took the worktree venv, and the test
    reported a fallback defect that was the fixture's own.
    """
    py = tree / ".venv" / "bin" / "python"
    py.parent.mkdir(parents=True, exist_ok=True)
    py.symlink_to(tree / ".venv" / "no-interpreter-here" / "python3.14")
    (tree / ".venv" / "pyvenv.cfg").write_text("home = /opt/homebrew/bin\n")
    assert not py.resolve().exists(), "the fixture's symlink must dangle"
    return py


def _unrunnable_venv(tree: Path) -> Path:
    """Present, executable, and it fails when run.

    The dangling symlink above does not test what the resolver claims: `-e`,
    `-f` and `-x` all follow the link and all answer false, so an
    existence-only check passes every other case in this file. Measured by
    mutation -- weakening `runs()` to `[ -e ]` left the suite green. This is a
    macOS venv whose `bin/python` was *copied* rather than symlinked: a Mach-O
    binary this kernel will not load, which every file test calls a good one.
    """
    py = tree / ".venv" / "bin" / "python"
    py.parent.mkdir(parents=True, exist_ok=True)
    py.write_text("#!/bin/sh\nexit 1\n")
    py.chmod(0o755)
    return py


def _worktree(main: Path, path: Path) -> Path:
    subprocess.run(
        ["git", "worktree", "add", "-q", str(path), "-b", "wt"],
        cwd=main, check=True, capture_output=True,
    )
    return path


def test_a_tree_with_its_own_working_venv_uses_it(tmp_path):
    main = _repo(tmp_path / "main")
    py = _working_venv(main)
    out = _run(main)
    assert out.returncode == 0, out.stderr
    assert out.stdout.strip() == str(py)


def test_a_worktree_whose_venv_is_foreign_falls_back_to_the_main_checkout(tmp_path):
    """The container case. The dangling symlink must not win by existing."""
    main = _repo(tmp_path / "main")
    good = _working_venv(main)
    wt = _worktree(main, tmp_path / "wt")
    _foreign_venv(wt)

    out = _run(wt)
    assert out.returncode == 0, out.stderr
    assert out.stdout.strip() == str(good)


def test_a_worktree_whose_interpreter_runs_and_fails_falls_back_too(tmp_path):
    """The case every file test gets wrong -- see `_unrunnable_venv`."""
    main = _repo(tmp_path / "main")
    good = _working_venv(main)
    wt = _worktree(main, tmp_path / "wt")
    _unrunnable_venv(wt)

    out = _run(wt)
    assert out.returncode == 0, out.stderr
    assert out.stdout.strip() == str(good)


def test_a_venv_that_runs_and_fails_is_rebuilt_under_ensure(tmp_path):
    main = _repo(tmp_path / "main")
    _unrunnable_venv(main)

    out = _run(main, "--ensure")
    assert out.returncode == 0, out.stderr
    resolved = Path(out.stdout.strip())
    assert subprocess.run([str(resolved), "-c", "print(1)"]).returncode == 0


def test_a_worktree_with_no_venv_falls_back_to_the_main_checkout(tmp_path):
    main = _repo(tmp_path / "main")
    good = _working_venv(main)
    wt = _worktree(main, tmp_path / "wt")

    out = _run(wt)
    assert out.returncode == 0, out.stderr
    assert out.stdout.strip() == str(good)


def test_a_worktree_with_a_working_venv_keeps_its_own(tmp_path):
    """The macOS case: both are native, and the nearer one is the right answer."""
    main = _repo(tmp_path / "main")
    _working_venv(main)
    wt = _worktree(main, tmp_path / "wt")
    own = _working_venv(wt)

    out = _run(wt)
    assert out.returncode == 0, out.stderr
    assert out.stdout.strip() == str(own)


def test_nothing_usable_and_no_ensure_is_an_error_not_a_guess(tmp_path):
    """Printing the system python here would install the suite's dependencies system-wide."""
    main = _repo(tmp_path / "main")

    out = _run(main)
    assert out.returncode != 0
    assert out.stdout.strip() == ""
    assert ".venv" in out.stderr


def test_a_foreign_venv_in_the_main_checkout_is_rebuilt_under_ensure(tmp_path):
    """`--ensure` repairs rather than reporting: nothing else can, and the caller is a suite run."""
    main = _repo(tmp_path / "main")
    _foreign_venv(main)

    out = _run(main, "--ensure")
    assert out.returncode == 0, out.stderr
    resolved = Path(out.stdout.strip())
    assert resolved == main / ".venv" / "bin" / "python"
    assert subprocess.run([str(resolved), "-c", "print(1)"]).returncode == 0


def test_ensure_does_not_rebuild_a_venv_that_works(tmp_path):
    """A rebuild costs the wheels; the fabricated interpreter proves it was left alone."""
    main = _repo(tmp_path / "main")
    py = _working_venv(main)
    before = py.read_text()

    out = _run(main, "--ensure")
    assert out.returncode == 0, out.stderr
    assert out.stdout.strip() == str(py)
    assert py.read_text() == before


def test_the_resolver_is_executable_and_the_shell_entry_points_use_it():
    """A resolver nothing calls is a resolver that resolves nothing.

    Structural, and it is the residue of a decision that could not stay in the
    entry points: their behaviour is "run the whole suite" and "boot a
    container", so no test can afford to observe which interpreter they picked.
    The choice itself is behavioural above; this only says the callers ask.
    """
    assert os.access(RESOLVER, os.X_OK)
    for caller in ("test.sh", ".devcontainer/post-start.sh", ".devcontainer/post-create.sh"):
        assert "venv_python.sh" in (REPO / caller).read_text(), caller


@pytest.mark.parametrize(
    "script",
    ["test.sh", ".devcontainer/post-start.sh", ".devcontainer/post-create.sh"],
)
def test_no_caller_hardcodes_the_venv_interpreter_any_more(script):
    """The hardcoded path is the defect: it names a file that exists and cannot run."""
    text = (REPO / script).read_text()
    offenders = [
        line for line in text.splitlines()
        if ".venv/bin/python" in line and not line.lstrip().startswith("#")
    ]
    assert offenders == [], offenders
