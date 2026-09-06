"""Removing a worktree does not silently abandon its stack.

**`git worktree remove` stops nothing.** It deletes a directory and a
registration; the Postgres and Redis it started keep running and the slot
stays in the registry. Nothing reports any of it - and the dev stack keeps its
database on a tmpfs, so what an abandoned one holds is RAM.

Measured on 2026-08-18: two abandoned stacks - four containers - had been up
for 6 and 13 hours from worktrees removed in the same session. They were found
by accident, and the shell that should have found them earlier could not reach
the daemon at all, so the failure printed nothing and was read as "nothing
running".

**The guard asks git which worktree you meant and docker which containers sit
under it.** Interpreting the operand as text -- joining it to the cwd and
handing the result to `stack.mjs`, whose project name is keyed on the exact
path string -- breaks on the spellings below: `git worktree remove <path>/`,
which is what tab completion types, produces a *different* project name, finds
no containers and allows the removal.

Every case drives the guard as a subprocess against a stub `docker` that
answers for one real directory, so a guard asking about the wrong directory
shows up as a permitted removal rather than being hidden by a stub that always
agrees.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

HOOK = Path(__file__).resolve().parents[1] / "scripts" / "stack_check.py"


def stub_docker(directory: Path, working_dir: str | None, status: str = "Up 2 hours") -> Path:
    """A `docker` reporting one compose container, for one directory only.

    **The point of the fixture.** A stub answering unconditionally makes every
    path defect invisible: the guard can ask about entirely the wrong worktree
    and still be told there are containers, so a mutation to its path handling
    leaves every case here green.
    """
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "docker"
    rows = "" if working_dir is None else f"c0ffee\\t{working_dir}\\tic-alpha\\t{status}\\n"
    path.write_text("#!/usr/bin/env bash\n" f'printf "%b" {json.dumps(rows)}\n')
    path.chmod(0o755)
    return path


def run_worktree(path: str, cwd: Path, docker: Path, env: dict | None = None):
    """Drive the check, which takes the path as an argv element.

    **The mode `land_worktree.sh` uses, and the reason it exists.** Carrying
    the path as the *text* of a git command through a fixed `/tmp` file costs
    two failures, both of which fail open on the cleanup the check exists to
    refuse: two landings at once read each other's file, and a path holding `;`
    or a space splits before `shlex.quote` can protect it, leaving the check
    with no git call to parse. One argv element has neither.
    """
    return subprocess.run(
        [sys.executable, str(HOOK), "--worktree", path],
        capture_output=True, text=True, timeout=30,
        env={**os.environ,
             "PATH": f"{docker.parent}{os.pathsep}{os.environ['PATH']}",
             **(env or {})},
        cwd=str(cwd),
    )


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    root.mkdir()
    for args in (["init", "-q", "-b", "dev"], ["config", "user.email", "t@e.com"],
                 ["config", "user.name", "t"]):
        subprocess.run(["git", *args], cwd=root, check=True, capture_output=True)
    (root / "a.txt").write_text("a\n")
    subprocess.run(["git", "add", "-A"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-qm", "first"], cwd=root, check=True,
                   capture_output=True)
    worktree = root / ".claude" / "worktrees" / "alpha"
    worktree.parent.mkdir(parents=True)
    subprocess.run(["git", "worktree", "add", "-q", str(worktree), "-b", "wt/alpha"],
                   cwd=root, check=True, capture_output=True)
    return root


def alpha(repo: Path) -> str:
    """The canonical path git reports, which is what the check resolves to."""
    return str((repo / ".claude" / "worktrees" / "alpha").resolve())


#: Spellings of one worktree. **Every one has to reach the same answer**,
#: because the analyst typing them means the same directory -- a check keyed on
#: the text gets a different project name for each.
SPELLINGS = ["{abs}", "{abs}/", "{abs}/../alpha", ".claude/worktrees/alpha",
             ".claude/worktrees/alpha/", "alpha"]


@pytest.mark.parametrize("spelling", SPELLINGS)
def test_every_spelling_of_one_worktree_is_refused(spelling: str, repo: Path,
                                                   tmp_path: Path) -> None:
    docker = stub_docker(tmp_path / "bin", f"{alpha(repo)}/server")
    path = spelling.format(abs=alpha(repo))
    result = run_worktree(path, repo, docker)
    assert result.returncode == 2, f"{path} was allowed: {result.stderr[:200]}"
    assert "still running" in result.stderr


def test_a_worktree_whose_directory_is_already_gone_is_still_refused(
    repo: Path, tmp_path: Path
) -> None:
    """**The abandoned case exactly.** The directory is deleted by hand and the
    registration removed afterwards, while the containers are still up. A check
    deriving the project from the path fails open here, having no path left to
    derive from; git still lists the worktree, so the answer is still there."""
    canonical = alpha(repo)
    docker = stub_docker(tmp_path / "bin", f"{canonical}/server")
    subprocess.run(["rm", "-rf", canonical], check=True)
    assert run_worktree(f"{canonical}", repo, docker).returncode == 2


def test_a_stopped_stack_counts(repo: Path, tmp_path: Path) -> None:
    """A stopped container still holds its slot and its image, and `docker ps`
    alone does not see it."""
    docker = stub_docker(tmp_path / "bin", f"{alpha(repo)}/server",
                         status="Exited (0) 3 hours ago")
    assert run_worktree(f"{alpha(repo)}", repo, docker).returncode == 2


def test_the_refusal_names_the_command_that_clears_it(repo: Path, tmp_path: Path) -> None:
    """A guard that refuses without the way through is one people export past.

    **And the way through has to be true.** `server/compose.dev.yaml` declares
    neither a volume the stack keeps nor an image it rebuilds - it is two
    published images with the database on a tmpfs, so neither `-v` nor
    `docker image prune` is justified. A false sentence in a refusal is read at
    the moment of action, which is the worst place for one.
    """
    message = run_worktree(alpha(repo), repo,
                           stub_docker(tmp_path / "bin", f"{alpha(repo)}/server")).stderr
    assert "--compose down" in message
    assert "tmpfs" in message, "the real cost is RAM, and the refusal should say so"
    assert "image prune" not in message, (
        "nothing in the dev stack is built, so a dangling image cannot come from it"
    )


def test_a_container_belonging_elsewhere_is_not_counted(repo: Path, tmp_path: Path) -> None:
    """**The direction that makes the check worth having.** Refusing because
    *some* stack is up is indistinguishable from a check that always refuses,
    and its bypass would be exported the same day."""
    docker = stub_docker(tmp_path / "bin", "/somewhere/else/server")
    assert run_worktree(f"{alpha(repo)}", repo, docker).returncode == 0


def test_it_allows_the_removal_once_nothing_is_running(repo: Path, tmp_path: Path) -> None:
    assert run_worktree(alpha(repo), repo,
                        stub_docker(tmp_path / "bin", None)).returncode == 0


def test_it_allows_the_removal_when_there_is_no_daemon(repo: Path,
                                                      tmp_path: Path) -> None:
    """**Fail open for an absent daemon**, which is the one shape that earns it.

    A check that refuses every removal on a box with no docker is one whose
    bypass gets exported on the first day, after which it watches nothing.
    """
    directory = tmp_path / "bin"
    directory.mkdir(parents=True)
    broken = directory / "docker"
    broken.write_text("#!/usr/bin/env bash\necho 'cannot connect' >&2\nexit 1\n")
    broken.chmod(0o755)
    assert run_worktree(f"{alpha(repo)}", repo, broken).returncode == 0


def test_it_refuses_when_docker_will_not_say(repo: Path, tmp_path: Path) -> None:
    """**A refused socket is not an answer of "none".**

    Pointing a `permission denied` stub at the check and demanding exit 0
    certifies it as inert in precisely the state a broken socket group
    produces, which is when an abandoned stack is most likely.
    """
    directory = tmp_path / "bin"
    directory.mkdir(parents=True)
    denied = directory / "docker"
    denied.write_text(
        "#!/usr/bin/env bash\n"
        "echo 'permission denied while trying to connect to the docker API' >&2\n"
        "exit 1\n"
    )
    denied.chmod(0o755)
    result = run_worktree(f"{alpha(repo)}", repo, denied)
    assert result.returncode == 2, "a docker that will not answer is not a docker with nothing to say"
    assert "permission denied" in result.stderr


def test_the_bypass_is_honoured(repo: Path, tmp_path: Path) -> None:
    docker = stub_docker(tmp_path / "bin", f"{alpha(repo)}/server")
    assert run_worktree(f"{alpha(repo)}", repo, docker,
               {"INCIDENTCOMPANION_ALLOW_ABANDONED_STACK": "1"}).returncode == 0


def test_it_writes_nothing(repo: Path, tmp_path: Path) -> None:
    """**A check that observes must not allocate.**

    Asking `stack.mjs --json` for the project name takes the registry lock and
    *persists a new slot* for any path spelling it has not seen -- so a guarded
    removal spends one, and probing leaves entries for directories that never
    existed. The compose labels carry the answer.
    """
    common = subprocess.run(
        ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
        cwd=repo, capture_output=True, text=True, check=True,
    ).stdout.strip()
    registry = Path(common) / "incidentcompanion-stack-slots.json"

    docker = stub_docker(tmp_path / "bin", f"{alpha(repo)}/server")
    run_worktree(f"{alpha(repo)}", repo, docker)
    run_worktree(f"{alpha(repo)}/", repo, docker)
    assert not registry.exists(), f"the check allocated slots: {registry.read_text()}"


def test_the_worktree_mode_refuses_a_running_stack(repo: Path, tmp_path: Path) -> None:
    """The path `land_worktree.sh` takes."""
    docker = stub_docker(tmp_path / "bin", f"{alpha(repo)}/server")
    result = run_worktree(alpha(repo), repo, docker)
    assert result.returncode == 2, result.stderr[:200]
    assert "still running" in result.stderr


def test_the_worktree_mode_allows_when_nothing_runs(repo: Path, tmp_path: Path) -> None:
    docker = stub_docker(tmp_path / "bin", None)
    assert run_worktree(alpha(repo), repo, docker).returncode == 0


@pytest.mark.parametrize("evil", ["al;pha", "al|pha", "al&&pha", "al pha", "al'pha"])
def test_a_metacharacter_in_the_path_does_not_fail_open(
    evil: str, repo: Path, tmp_path: Path
) -> None:
    """**A path is data, and the argument mode never treats it as a command.**

    Build the text of a git command and hand it to a shell-aware splitter and
    `;`, `|`, `&&` and a space in a worktree's path split before `shlex.quote`
    can protect them -- the guard then sees no git call and permits the removal
    it exists to refuse. git accepts these in a branch name, so `wt/fix;now`
    reaches this. Here the path is one argv element and its own containers are
    found whatever bytes it holds.

    A newline is deliberately not in this list: `docker ps --format` delimits
    its rows with newline and has no NUL option, so a newline inside a
    container's `working_dir` label breaks the parse in `containers_under`
    regardless of this mode - a limit named in `worktrees()`, not a fix claimed
    here. It takes a hand-made directory name; branch names carry no newline.
    """
    worktree = repo / ".claude" / "worktrees" / evil
    worktree.parent.mkdir(parents=True, exist_ok=True)
    branch = "wt/" + str(abs(hash(evil)))
    subprocess.run(["git", "worktree", "add", "-q", str(worktree), "-b", branch],
                   cwd=repo, check=True, capture_output=True)
    canonical = str(worktree.resolve())
    docker = stub_docker(tmp_path / "bin", f"{canonical}/server")
    result = run_worktree(canonical, repo, docker)
    assert result.returncode == 2, (
        f"a path holding {evil!r} was allowed: {result.stderr[:200]}")
    assert "still running" in result.stderr


def test_the_worktree_mode_honours_the_bypass(repo: Path, tmp_path: Path) -> None:
    docker = stub_docker(tmp_path / "bin", f"{alpha(repo)}/server")
    assert run_worktree(alpha(repo), repo, docker,
                        {"INCIDENTCOMPANION_ALLOW_ABANDONED_STACK": "1"}).returncode == 0


def test_the_worktree_mode_refuses_a_denied_socket(repo: Path, tmp_path: Path) -> None:
    """A refused docker is unknown, not none - the same in this mode as the hook."""
    directory = tmp_path / "bin"
    directory.mkdir(parents=True)
    denied = directory / "docker"
    denied.write_text(
        "#!/usr/bin/env bash\n"
        "echo 'permission denied while trying to connect to the docker API' >&2\n"
        "exit 1\n"
    )
    denied.chmod(0o755)
    result = run_worktree(alpha(repo), repo, denied)
    assert result.returncode == 2
    assert "permission denied" in result.stderr
