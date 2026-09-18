"""`git_ignores` answers about a directory that is supplied as a symbolic link.

A worktree links its dependencies from the main checkout rather than
installing them, and `git check-ignore` refuses a pathspec that reaches
through a link -- aborting the whole batch, whose empty output reads as none
of the paths being ignored.

Built in a temporary repository rather than asserted against this one: the
condition depends on whether the checkout running the test happens to have a
link there, which is true of a worktree and false in CI.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from tests.repo.test_docstring_claims import git_ignores


def build(root: Path) -> None:
    """A repository whose ignored directory is a link, as a worktree's is."""
    subprocess.run(["git", "init", "-q"], cwd=root, check=True)
    (root / ".gitignore").write_text("node_modules\n", encoding="utf-8")
    (root / "elsewhere").mkdir()
    (root / "elsewhere" / "a-package").mkdir()
    (root / "node_modules").symlink_to(root / "elsewhere")
    (root / "openspec").mkdir()
    (root / "openspec" / "changes").mkdir()


def test_the_batch_probe_is_refused_by_the_link(tmp_path: Path) -> None:
    """The condition itself, so a git that stopped refusing retires this file."""
    build(tmp_path)
    done = subprocess.run(
        ["git", "check-ignore", "--stdin"],
        cwd=tmp_path,
        input="node_modules/x\n",
        capture_output=True,
        text=True,
        check=False,
    )
    assert done.returncode == 128, (
        "git no longer refuses a pathspec that reaches through a symbolic link, so "
        f"the failure this file is about is gone: rc={done.returncode} {done.stderr!r}"
    )


def test_a_linked_directory_still_answers_as_ignored(tmp_path: Path) -> None:
    """The answer the caller needs, which the aborted batch could not give."""
    build(tmp_path)
    assert git_ignores({"node_modules", "openspec/changes"}, root=tmp_path) == {"node_modules"}


def test_one_refused_path_does_not_erase_the_others(tmp_path: Path) -> None:
    """The damage the batch did: every answer lost, not only the refused one.

    `openspec/changes` is tracked and so is absent from the result either way;
    what this pins is that asking alongside a refused path still answers for it.
    """
    build(tmp_path)
    (tmp_path / "build").mkdir()
    (tmp_path / ".gitignore").write_text("node_modules\nbuild\n", encoding="utf-8")
    assert git_ignores({"node_modules", "build", "openspec/changes"}, root=tmp_path) == {
        "node_modules",
        "build",
    }
