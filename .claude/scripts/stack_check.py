#!/usr/bin/env python3
"""Refuse to remove a worktree while that worktree's stack is still up.

**`git worktree remove` stops nothing.** It deletes a directory and a
registration; the Postgres and Redis it started keep running, and the slot
stays in the registry. Nothing reports any of it, so the containers are found -
if at all - by somebody wondering why the laptop is busy. Measured 2026-08-18:
two stacks, four containers, up 6 and 13 hours from removals in one session.

→ the `land` skill, which owns the cleanup this points at.

**A check rather than another line in that skill**, because the skill already
said to clean up. Both removals were the last command of a landing, which is
where a checklist is skipped and a refusal is not. `land_worktree.sh` calls
this before it removes anything, and fails closed when it cannot.

**Git says which worktree, docker says which containers, and this asks both.**
The first version interpreted the operand as text and handed the result to
`stack.mjs`, whose project name is keyed on the exact path string - so
`git worktree remove <path>/`, which is what tab completion types, produced a
different project, found nothing, and allowed the removal. Asking `stack.mjs`
also *allocated*: it took the registry lock and persisted a slot for every
spelling it had not seen.

    python3 .claude/scripts/stack_check.py --worktree <path>

Exit 0 allows, exit 2 blocks. `INCIDENTCOMPANION_ALLOW_ABANDONED_STACK=1` is
the deliberate case.
"""

import os
import subprocess
import sys


def run_git(args: list[str], cwd: str) -> str | None:
    """stdout, or None if git could not answer. Never raises."""
    try:
        proc = subprocess.run(
            ["git", *args], cwd=cwd, capture_output=True, text=True, timeout=5
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return None if proc.returncode else proc.stdout.strip()


#: Long enough for a cold `docker`, short enough to decide rather than be
#: killed: a check killed at its timeout never exits 2, so the removal it was
#: refusing runs.
_TIMEOUT = 5


def worktrees(cwd: str) -> list[str]:
    """Every worktree git knows about, as the canonical paths git reports.

    **`;`, `|` and `&&` in a path are handled; a newline is not.** The reachable
    metacharacters survive because the path is passed to `--worktree` as an argv
    element rather than reconstructed into a command. A newline is different in
    kind: `docker ps --format` delimits its own rows with newline and offers no
    NUL option, so a newline *inside* a container's `working_dir` label breaks
    `containers_under`'s parse no matter what this function does. A worktree
    directory with a literal newline in its name is the only way to reach it,
    and git branch names carry none, so the default `$WORKTREE` never does.
    """
    listing = run_git(["worktree", "list", "--porcelain"], cwd)
    if not listing:
        return []
    return [line[len("worktree "):].strip()
            for line in listing.split("\n") if line.startswith("worktree ")]


def resolve(operand: str, cwd: str, known: list[str]) -> str | None:
    """Which of git's worktrees `operand` names, or None to leave it to git.

    **Matched against git's own list rather than computed.** A trailing slash,
    a `..`, a relative path and a bare name are four spellings of one directory
    and git accepts all of them; string arithmetic makes them four answers, and
    the wrong one silently finds no containers.
    """
    candidate = operand if os.path.isabs(operand) else os.path.join(cwd, operand)
    candidate = os.path.normpath(candidate)
    for path in known:
        if os.path.normpath(path) == candidate:
            return path
        # A worktree can be named by its directory alone, which git resolves
        # through `.git/worktrees/<name>`.
        if operand == os.path.basename(os.path.normpath(path)):
            return path
        try:
            if os.path.exists(candidate) and os.path.samefile(path, candidate):
                return path
        except OSError:
            continue
    return None


def containers_under(worktree: str) -> list[tuple[str, str]]:
    """`(project, status)` for every compose container inside that worktree.

    **The compose labels carry this; nothing needs deriving.** `working_dir` is
    the directory the stack was composed from, so a prefix test answers without
    knowing how this repository lays its compose files out - and without
    allocating a slot to learn a project name.

    `ps -a`, not `ps`: a stopped container still holds its slot and its disk.

    **Failing open is right for an absent daemon and wrong for a refused one.**
    A box with no docker is a box where refusing every removal gets the bypass
    exported on day one. A `permission denied` is different in kind: docker is
    there, containers may well be running, and the answer is not "none" but
    "unknown" - which is exactly the state a broken socket group produces, and
    exactly when an abandoned stack is most likely. Measured: in that state
    this guard permitted every removal while two containers ran.
    """
    fields = ('{{.ID}}\t{{.Label "com.docker.compose.project.working_dir"}}'
              '\t{{.Label "com.docker.compose.project"}}\t{{.Status}}')
    try:
        done = subprocess.run(
            ["docker", "ps", "-a", "--filter", "label=com.docker.compose.project",
             "--format", fields],
            capture_output=True, text=True, timeout=_TIMEOUT,
        )
    except FileNotFoundError:
        return []          # no docker here at all: nothing to abandon
    except (OSError, subprocess.SubprocessError):
        return []
    if done.returncode != 0:
        if "permission denied" in done.stderr.lower():
            raise PermissionError(done.stderr.strip().split("\n")[0])
        return []

    root = os.path.normpath(worktree)
    found = []
    for line in done.stdout.split("\n"):
        parts = line.split("\t")
        if len(parts) < 4 or not parts[1]:
            continue
        where = os.path.normpath(parts[1])
        if where == root or where.startswith(root + os.sep):
            found.append((parts[2], parts[3]))
    return found


def refusal(worktree: str, found: list[tuple[str, str]]) -> str:
    projects = sorted({project for project, _ in found if project})
    return (
        f"Blocked: {worktree} has {len(found)} container(s) still running as "
        f"{', '.join(projects) or 'a compose project'}.\n"
        f"Removing a worktree stops none of them, and the slot stays "
        f"registered. Two of these sat for 6 and 13 hours on 2026-08-18, found "
        f"by accident.\n"
        f"Take it down from inside the worktree first:\n"
        f"  (cd {worktree} && node server/scripts/stack.mjs --compose down -v)\n"
        f"The dev stack keeps its database on a tmpfs, so each one that is up "
        f"is holding RAM rather than disk -- which is the cost worth caring "
        f"about on a 16GB laptop. `-v` is belt and braces: the file declares no "
        f"named volumes today.\n"
        f"To remove it and deal with the stack later, re-run with "
        f"INCIDENTCOMPANION_ALLOW_ABANDONED_STACK=1 set."
    )


def check(worktree: str) -> int:
    """Refuse (2) if `worktree`'s stack is up or docker will not say, else allow (0).

    The one place the decision is made, reached two ways: the hook parses a
    `git worktree remove` out of a Bash command, and `--worktree` takes the
    path directly. Both resolve to a path and end here, so a script does not
    reconstruct a command for the guard to re-parse.
    """
    try:
        found = containers_under(worktree)
    except PermissionError as refused:
        print(
            f"Blocked: cannot tell whether {worktree} still has containers "
            f"- docker refused this session:\n  {refused}\n"
            f"That is not an answer of \"none\": the daemon is there and the "
            f"stack may well be up, which is when a removal abandons it. "
            f"The socket group is granted at image build "
            f"(`.devcontainer/features/socket-group`), so a session without "
            f"it means the container needs rebuilding.\n"
            f"To remove it anyway, re-run with "
            f"INCIDENTCOMPANION_ALLOW_ABANDONED_STACK=1 set.",
            file=sys.stderr,
        )
        return 2
    if not found:
        return 0
    print(refusal(worktree, found), file=sys.stderr)
    return 2


def check_path(operand: str, cwd: str, consent_env: str | None) -> int:
    """`--worktree` mode: the path as an argv element, never as command text.

    **The path as an argument, never as command text.** An earlier version built
    the *text* of a git command, wrote it to a fixed `/tmp` file and piped it
    back to be re-parsed: two concurrent landings read each other's file, and a
    path holding `;` or a newline split before `shlex.quote` could protect it,
    so the check saw no git call and permitted the cleanup it exists to refuse.
    """
    if consent_env and os.environ.get(consent_env):
        return 0
    here = cwd or os.getcwd()
    worktree = resolve(operand, here, worktrees(here))
    if worktree is None:
        return 0  # not a worktree git knows: its error to report, not ours
    return check(worktree)


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 2 or argv[0] != "--worktree":
        print("usage: stack_check.py --worktree <path>", file=sys.stderr)
        return 2
    return check_path(argv[1], os.getcwd(), "INCIDENTCOMPANION_ALLOW_ABANDONED_STACK")


if __name__ == "__main__":
    raise SystemExit(main())
