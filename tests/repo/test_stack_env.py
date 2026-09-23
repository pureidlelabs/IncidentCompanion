"""The chain from `mise.toml` to the script that prints the environment is unbroken.

Every link fails quietly: a missing `_.source` warns onto a prompt nobody
reads, and `eval "$(node <missing>)"` sets nothing and exits 0.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tomllib
from pathlib import Path

import pytest
from tests._repo import REPO_ROOT

#: Re-entries a stand-in shim allows before refusing, so the old recursion
#: stops at a count the assertion can read instead of at the process table.
CAP = 20


def test_the_shell_environment_reaches_the_script_that_prints_it() -> None:
    config = tomllib.loads((REPO_ROOT / "mise.toml").read_text(encoding="utf-8"))
    sourced = config["env"]["_"]["source"]

    wrapper = REPO_ROOT / sourced
    assert wrapper.is_file(), f"mise.toml sources {sourced!r}, which is not a file"

    ran = re.findall(r"node\s+(\S+\.mjs)", wrapper.read_text(encoding="utf-8"))
    assert ran, f"{sourced} runs no script, so a shell sourcing it gets nothing"
    for path in ran:
        assert (REPO_ROOT / path).is_file(), f"{sourced} runs {path!r}, which is not a file"


def _fresh_clone(at: Path) -> Path:
    """The files environment evaluation reads, in a git tree with no `node_modules`."""
    tree = at / "clone"
    for name in ("mise.toml", "stack-env.sh", "server/scripts/stack.mjs"):
        (tree / name).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(REPO_ROOT / name, tree / name)
    subprocess.run(["git", "init", "-q", str(tree)], check=True)
    return tree


def _real_node() -> Path:
    """The node binary itself, never a shim standing in front of it."""
    node = shutil.which("node")
    if node is None:
        pytest.skip("no node on PATH")
    return Path(subprocess.check_output([node, "-p", "process.execPath"], text=True).strip())


def _shim(at: Path, shim: Path, body: str) -> Path:
    """A `node` in `shim` that counts its calls and refuses past `CAP`, then runs `body`."""
    count = at / "count"
    shim.mkdir(parents=True)
    (shim / "node").write_text(
        "#!/bin/bash\n"
        f'n=$(( $(cat "{count}" 2>/dev/null || echo 0) + 1 )); echo "$n" > "{count}"\n'
        f'[ "$n" -gt {CAP} ] && {{ echo "node re-entered $n times" >&2; exit 97; }}\n'
        f"{body}\n",
        encoding="utf-8",
    )
    (shim / "node").chmod(0o755)
    return shim


def _calls(at: Path) -> int:
    return int((at / "count").read_text(encoding="utf-8"))


def test_a_node_that_re_enters_the_environment_runs_once(tmp_path: Path) -> None:
    """A mise shim is `mise exec`, which sources `stack-env.sh` again before it runs node.

    Stood in for by a `node` doing exactly that, so this runs where mise is not
    installed. The real shim is `test_mise_evaluates_a_fresh_clone_without_recursing`.
    """
    tree = _fresh_clone(tmp_path)
    shim = _shim(
        tmp_path,
        tmp_path / "shim",
        "bash --noprofile -c '. ./stack-env.sh; export -p' > /dev/null\n"
        f'exec "{_real_node()}" "$@"',
    )

    ran = subprocess.run(
        ["bash", "--noprofile", "-c", ". ./stack-env.sh; export -p"],
        cwd=tree,
        env={"HOME": str(tmp_path), "PATH": f"{shim}:/usr/bin:/bin"},
        capture_output=True,
        text=True,
        timeout=60,
    )

    assert _calls(tmp_path) == 1, ran.stderr
    assert ran.returncode == 0, ran.stderr
    assert "DATABASE_URL=" in ran.stdout, ran.stderr
    assert "IC_STACK_ENV_SOURCING" not in ran.stdout


def test_mise_evaluates_a_fresh_clone_without_recursing(tmp_path: Path) -> None:
    """Entering a clone before any install, with a mise shim for node on PATH.

    The shim is mise itself run as `node`, which is what a shim is; the wrapper
    only counts. Skipped where mise is not installed, which includes CI.
    """
    mise = shutil.which("mise")
    if mise is None:
        pytest.skip("mise is not installed, so there is no shim to re-enter")
    tree = _fresh_clone(tmp_path)
    state = tmp_path / "mise"
    # Where mise keeps its shims, because that is the directory it drops from
    # PATH when looking for the node a shim stands in front of.
    shim = _shim(tmp_path, state / "data" / "shims", f'exec -a node "{mise}" "$@"')

    ran = subprocess.run(
        [mise, "env"],
        cwd=tree,
        env={
            "HOME": str(tmp_path),
            "PATH": f"{shim}:{_real_node().parent}:/usr/bin:/bin",
            "MISE_TRUSTED_CONFIG_PATHS": str(tree),
            "MISE_AUTO_INSTALL": "0",
            **{f"MISE_{d}_DIR": str(state / d.lower()) for d in ("CONFIG", "DATA", "STATE", "CACHE")},
        },
        capture_output=True,
        text=True,
        timeout=60,
    )

    assert _calls(tmp_path) == 1, ran.stderr
    assert ran.returncode == 0, ran.stderr
    assert "DATABASE_URL=" in ran.stdout, ran.stderr


def test_a_worktree_without_its_install_is_refused_in_one_line(tmp_path: Path) -> None:
    """A worktree needs the slot lock, and the lock is a package the clone may not have yet."""
    tree = _fresh_clone(tmp_path)
    shutil.rmtree(tree / ".git")
    (tree / ".git").write_text("gitdir: elsewhere\n", encoding="utf-8")

    ran = subprocess.run(
        [str(_real_node()), "server/scripts/stack.mjs", "--export"],
        cwd=tree,
        env={
            **os.environ,
            "IC_STACK_ROOT": str(tree),
            "IC_STACK_REGISTRY": str(tmp_path / "slots.json"),
        },
        capture_output=True,
        text=True,
        timeout=60,
    )

    assert ran.returncode != 0
    assert ran.stdout == ""
    assert ran.stderr.strip().count("\n") == 0, ran.stderr
    assert "npm install" in ran.stderr
