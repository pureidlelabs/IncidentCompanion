"""`land_worktree.sh` asks `stack_check.py` before it removes anything.

**Removing a worktree stops nothing that worktree started.** The Postgres and
Redis keep running and the slot stays registered, and the landing is where that
is most likely to happen unnoticed - it is the last command of the sequence.
So the script asks the check directly rather than carrying a second copy of it,
and fails closed when the check is missing.

These drive the real script end to end against a bare origin, because the
removal sits after the merge and the push and is unreachable without both.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / ".claude" / "scripts" / "land_worktree.sh"


def git(*args: str, cwd: Path) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True,
                          text=True, check=True)


def stub_docker(directory: Path, working_dir: str | None) -> Path:
    """A `docker` reporting one compose container, for one directory only."""
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "docker"
    rows = "" if working_dir is None else f"c0ffee\\t{working_dir}\\tic-alpha\\tUp 2 hours\\n"
    path.write_text("#!/usr/bin/env bash\n" f'printf "%b" {json.dumps(rows)}\n')
    path.chmod(0o755)
    return path


@pytest.fixture
def landing(tmp_path: Path) -> tuple[Path, Path]:
    """A checkout on `dev` with a bare origin and a worktree to land."""
    origin = tmp_path / "origin.git"
    subprocess.run(["git", "init", "-q", "--bare", "-b", "dev", str(origin)], check=True)

    root = tmp_path / "repo"
    root.mkdir()
    git("init", "-q", "-b", "dev", cwd=root)
    git("config", "user.email", "t@e.com", cwd=root)
    git("config", "user.name", "t", cwd=root)
    git("remote", "add", "origin", str(origin), cwd=root)
    (root / "a.txt").write_text("a\n")
    # As the repository does: without it the worktree directory itself is an
    # untracked path in the main checkout, and the landing refuses for that
    # instead - a refusal that reads exactly like the one under test.
    (root / ".gitignore").write_text(".claude/worktrees/\n__pycache__/\n")

    # **The scripts under test are copied in and committed**, so the fixture is
    # clean when the landing runs - `land_worktree.sh` refuses a dirty main
    # checkout, which is a different refusal from the one being tested and
    # reads exactly like it in the output.
    (root / ".claude" / "scripts").mkdir(parents=True, exist_ok=True)
    (root / ".claude" / "scripts" / "stack_check.py").write_bytes(
        (REPO_ROOT / ".claude" / "scripts" / "stack_check.py").read_bytes())
    landing = root / ".claude" / "scripts" / "land_worktree.sh"
    landing.write_bytes(SCRIPT.read_bytes())
    landing.chmod(0o755)

    git("add", "-A", cwd=root)
    git("commit", "-qm", "first", cwd=root)
    git("push", "-q", "origin", "dev", cwd=root)

    worktree = root / ".claude" / "worktrees" / "alpha"
    worktree.parent.mkdir(parents=True, exist_ok=True)
    git("worktree", "add", "-q", str(worktree), "-b", "wt/alpha", cwd=root)
    (worktree / "b.txt").write_text("b\n")
    git("add", "-A", cwd=worktree)
    git("commit", "-qm", "work", cwd=worktree)
    return root, worktree


def land(root: Path, docker: Path, env: dict | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["bash", ".claude/scripts/land_worktree.sh", "wt/alpha",
         ".claude/worktrees/alpha"],
        cwd=root, capture_output=True, text=True, timeout=60,
        env={**os.environ,
             "PATH": f"{docker.parent}{os.pathsep}{os.environ['PATH']}",
             **(env or {})},
    )


def test_it_lands_and_removes_when_nothing_is_running(landing, tmp_path) -> None:
    """The happy path still completes, or the guard is a landing that never ends."""
    root, worktree = landing
    done = land(root, stub_docker(tmp_path / "bin", None))
    assert done.returncode == 0, done.stderr
    assert not worktree.exists(), "the worktree survived a clean landing"
    assert "b.txt" in git("show", "--name-only", "--format=", "HEAD",
                          cwd=root).stdout


def test_it_keeps_the_worktree_when_its_stack_is_up(landing, tmp_path) -> None:
    """**The whole point.** The merge and the push are done and correct; only
    the removal is refused, because removing it strands the containers."""
    root, worktree = landing
    done = land(root, stub_docker(tmp_path / "bin", f"{worktree.resolve()}/server"))

    assert worktree.exists(), "the worktree was removed with its stack still up"
    assert "still running" in (done.stdout + done.stderr)
    # The landing itself must have happened - refusing the cleanup is not
    # refusing the merge, and a script that undid the merge would be worse.
    assert "b.txt" in git("show", "--name-only", "--format=", "HEAD",
                          cwd=root).stdout


def test_the_bypass_reaches_the_script_too(landing, tmp_path) -> None:
    """One bypass, not two: the guard's own flag has to work through here."""
    root, worktree = landing
    done = land(root, stub_docker(tmp_path / "bin", f"{worktree.resolve()}/server"),
                {"INCIDENTCOMPANION_ALLOW_ABANDONED_STACK": "1"})
    assert done.returncode == 0, done.stderr
    assert not worktree.exists()


def test_two_landings_at_once_do_not_read_each_others_state(tmp_path: Path) -> None:
    """**The race the fixed `/tmp` path created, and the shape that catches it.**

    The guard used to be handed a command string through `/tmp/land-payload.json`
    - a fixed name, written then re-read - so two landings overlapping read each
    other's file, resolved no matching worktree, and each permitted the removal
    it exists to refuse. Reproduced 7 of 10 runs under `pytest -n 3` before the
    fix; the `--worktree` argument mode has no shared file to race on.

    Built inline rather than through the `landing` fixture because each landing
    needs its own repository, origin and stack so the two are genuinely
    independent.
    """
    import concurrent.futures

    def one(index: int) -> subprocess.CompletedProcess:
        origin = tmp_path / f"origin{index}.git"
        subprocess.run(["git", "init", "-q", "--bare", "-b", "dev", str(origin)], check=True)
        root = tmp_path / f"repo{index}"
        root.mkdir()
        git("init", "-q", "-b", "dev", cwd=root)
        git("config", "user.email", "t@e.com", cwd=root)
        git("config", "user.name", "t", cwd=root)
        git("remote", "add", "origin", str(origin), cwd=root)
        (root / "a.txt").write_text("a\n")
        (root / ".gitignore").write_text(".claude/worktrees/\n__pycache__/\n")
        (root / ".claude" / "scripts").mkdir(parents=True, exist_ok=True)
        (root / ".claude" / "scripts" / "stack_check.py").write_bytes(
            (REPO_ROOT / ".claude" / "scripts" / "stack_check.py").read_bytes())
        landing_sh = root / ".claude" / "scripts" / "land_worktree.sh"
        landing_sh.write_bytes(SCRIPT.read_bytes())
        landing_sh.chmod(0o755)
        git("add", "-A", cwd=root)
        git("commit", "-qm", "first", cwd=root)
        git("push", "-q", "origin", "dev", cwd=root)
        worktree = root / ".claude" / "worktrees" / "alpha"
        worktree.parent.mkdir(parents=True, exist_ok=True)
        git("worktree", "add", "-q", str(worktree), "-b", "wt/alpha", cwd=root)
        (worktree / "b.txt").write_text("b\n")
        git("add", "-A", cwd=worktree)
        git("commit", "-qm", "work", cwd=worktree)
        docker = stub_docker(tmp_path / f"bin{index}", f"{worktree.resolve()}/server")
        return root, worktree, land(root, docker)

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(one, range(6)))

    for root, worktree, done in results:
        assert worktree.exists(), (
            "a landing removed its worktree with the stack still up - the "
            "guard was handed another landing's state")
        assert "still running" in (done.stdout + done.stderr)


def test_the_landing_writes_no_shared_temp_file(landing, tmp_path) -> None:
    """The fixed `/tmp` path is gone, so no landing can collide on it or be
    aimed at a symlink planted there."""
    root, worktree = landing
    # Hermetic: a stale file from another run must not pass or fail this on its
    # own, so it is cleared first and its reappearance is what the test reads.
    Path("/tmp/land-payload.json").unlink(missing_ok=True)
    land(root, stub_docker(tmp_path / "bin", f"{worktree.resolve()}/server"))
    assert not Path("/tmp/land-payload.json").exists(), (
        "the landing still writes /tmp/land-payload.json - a fixed path two "
        "landings race on and a symlink can redirect")


def test_a_missing_check_says_so_rather_than_removing_silently(tmp_path) -> None:
    """**Guard-absent must not read as guard-passed.** A checkout that lost the
    hook file used to skip the block with no `else` and remove the worktree
    without a word - indistinguishable from a clean check. Now it names the
    gap and stops, since the stack cannot be verified.

    Built with the guard absent from the first commit rather than deleted from
    the `landing` fixture: deleting it and committing would move dev ahead of
    the worktree and the `--ff-only` merge would refuse before the removal is
    ever reached.
    """
    root = tmp_path / "repo"
    root.mkdir()
    git("init", "-q", "-b", "dev", cwd=root)
    git("config", "user.email", "t@e.com", cwd=root)
    git("config", "user.name", "t", cwd=root)
    origin = tmp_path / "origin.git"
    subprocess.run(["git", "init", "-q", "--bare", "-b", "dev", str(origin)], check=True)
    git("remote", "add", "origin", str(origin), cwd=root)
    (root / "a.txt").write_text("a\n")
    (root / ".gitignore").write_text(".claude/worktrees/\n__pycache__/\n")
    (root / ".claude" / "scripts").mkdir(parents=True, exist_ok=True)
    # stack_check.py deliberately absent: the fail-closed path.
    landing_sh = root / ".claude" / "scripts" / "land_worktree.sh"
    landing_sh.write_bytes(SCRIPT.read_bytes())
    landing_sh.chmod(0o755)
    git("add", "-A", cwd=root)
    git("commit", "-qm", "first", cwd=root)
    git("push", "-q", "origin", "dev", cwd=root)
    worktree = root / ".claude" / "worktrees" / "alpha"
    worktree.parent.mkdir(parents=True, exist_ok=True)
    git("worktree", "add", "-q", str(worktree), "-b", "wt/alpha", cwd=root)
    (worktree / "b.txt").write_text("b\n")
    git("add", "-A", cwd=worktree)
    git("commit", "-qm", "work", cwd=worktree)

    done = land(root, stub_docker(tmp_path / "bin", f"{worktree.resolve()}/server"))
    assert "No stack guard" in (done.stdout + done.stderr)
    assert worktree.exists(), "the worktree was removed with no guard to check it"


def test_landing_twice_in_one_tree_is_not_a_dirty_checkout(landing, tmp_path) -> None:
    """The guard runs as a subprocess and drops `__pycache__` in the fixture;
    a second landing then refuses on a dirty tree, a different refusal that
    reads like the one under test. The fixture ignores it, as the repo does."""
    root, worktree = landing
    docker = stub_docker(tmp_path / "bin", f"{worktree.resolve()}/server")
    land(root, docker)
    second = land(root, docker)
    assert "dirty" not in (second.stdout + second.stderr).lower(), (
        "a second landing refused on __pycache__ the guard's own run created")
