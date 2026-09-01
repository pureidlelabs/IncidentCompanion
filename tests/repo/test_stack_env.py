"""The chain from `mise.toml` to the script that prints the environment is unbroken.

**Every link in it fails quietly**, which is why this is a test rather than a
note. mise's `_.source` pointed at a path that does not exist warns once, on a
shell prompt nobody is reading; `eval "$(node <a missing file>)"` sets no
variable and exits 0. A rename anywhere along the chain therefore leaves a
shell with no `DATABASE_URL` and nothing that says so -- the same silent
absence the environment was moved into mise to stop.
"""

from __future__ import annotations

import re
import tomllib

from tests._repo import REPO_ROOT


def test_the_shell_environment_reaches_the_script_that_prints_it() -> None:
    config = tomllib.loads((REPO_ROOT / "mise.toml").read_text(encoding="utf-8"))
    sourced = config["env"]["_"]["source"]

    wrapper = REPO_ROOT / sourced
    assert wrapper.is_file(), f"mise.toml sources {sourced!r}, which is not a file"

    ran = re.findall(r"node\s+(\S+\.mjs)", wrapper.read_text(encoding="utf-8"))
    assert ran, f"{sourced} runs no script, so a shell sourcing it gets nothing"
    for path in ran:
        assert (REPO_ROOT / path).is_file(), f"{sourced} runs {path!r}, which is not a file"


def test_the_activated_venv_is_the_one_a_worktree_shares() -> None:
    """The two forms this rejects are the two mise leads you to.

    `scripts/venv_python.sh` reads `$tree_root/.venv/bin/python` before the main
    checkout's, so a venv sitting in a worktree wins and an empty one takes
    `pytest` with it. `create = true` makes exactly that, and mise's warning on
    a missing `.venv` recommends building it by hand, which makes the same one.
    """
    config = tomllib.loads((REPO_ROOT / "mise.toml").read_text(encoding="utf-8"))
    venv = config["env"]["_"]["python"]["venv"]

    assert isinstance(venv, str), (
        f"_.python.venv is {venv!r}; the table form carries `create`, and a venv "
        "created in a worktree shadows the main checkout's")
    assert "git-common-dir" in venv, (
        f"_.python.venv is {venv!r}, which resolves inside whichever tree reads it -- "
        "a worktree then warns on every prompt, or shadows the shared venv once "
        "somebody follows the warning")
