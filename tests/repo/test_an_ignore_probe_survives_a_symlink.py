"""One refused pathspec does not cost `git_ignores` every answer.

git aborts a whole `check-ignore --stdin` run over a single pathspec it will
not resolve, and the empty output reads as none of the paths being ignored. A
worktree reaches that by linking its dependencies rather than installing them.

**These pin the per-path retry, not the handling of links.** The probes under
each tree reach the same pattern without crossing the link, so the answer for
a linked directory comes from a sibling probe once the batch stops swallowing
it.

Built in a temporary repository rather than asserted against this one: whether
a checkout has a link there is true of a worktree and false in CI, so a test
against the real tree would pass in CI without reproducing anything.
"""

from __future__ import annotations

import os
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
    """The condition itself, so a git that stopped refusing retires this file.

    The message is asserted as well as the code, because 128 is also what a
    dubious-ownership refusal and a path outside the repository return.
    """
    build(tmp_path)
    # `LC_ALL=C`, because git translates this message and the assertion reads it.
    done = subprocess.run(
        ["git", "check-ignore", "--stdin"],
        cwd=tmp_path,
        input="node_modules/x\n",
        capture_output=True,
        text=True,
        check=False,
        env={**os.environ, "LC_ALL": "C"},
    )
    assert done.returncode == 128 and "beyond a symbolic link" in done.stderr, (
        "git no longer refuses a pathspec that reaches through a symbolic link, so the "
        f"failure this file is about is gone: rc={done.returncode} {done.stderr!r}. A "
        "return code alone would not do here: 128 also covers a dubious-ownership "
        "refusal and a path outside the repository."
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
