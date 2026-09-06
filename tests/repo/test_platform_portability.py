"""What a green run on this machine does and does not prove about the
filesystem.

The app is POSIX-only -- Linux in the container everywhere, macOS on the host
as a development path. Two questions survive, for reasons that are not about
Windows:

- **Permission modes go through one oracle.** `0600`/`0700` is an unconditional
  guarantee, and `posix_modes.assert_owner_only` is the single call site so it
  can stay one. A hand-written `st_mode & 0o777` comparison is an
  ordinary-looking line that drifts from what the app promises.
- **The parallel runners' configuration.** `-n auto` without `--dist loadfile`
  splits a file's tests across processes and *unmasks* an order dependence,
  intermittently, in a file nobody was editing.
"""

from __future__ import annotations

import pathlib
import re
import sys

import pytest

from tests._repo import REPO_ROOT

# **Named, not derived.** This sweep is about the directory pytest puts
# on `sys.path`, not about wherever this file happens to sit -- moving it
# once pointed the glob at another folder and every assertion still
# passed, guarding nothing.
TESTS_DIR = REPO_ROOT / "tests"


# The one module allowed to compare a raw mode.
MODE_ORACLE = "posix_modes.py"
THIS_FILE = pathlib.Path(__file__).name

# Matches the operation, not one spelling of it: `stat.S_IMODE(...)` is the
# standard library's own name for the same masking and was invisible to the
# `& 0o777` form alone. Wider and noisier is the right error here -- a false
# positive costs one exemption, a false negative costs an unenforced claim.
_RAW_MODE_ASSERTION = re.compile(r"st_mode\s*&\s*0o777|S_IMODE\s*\(")


def _without_comments(path: pathlib.Path) -> str:
    """Source with comment lines dropped, for checks that search text.

    Not fastidiousness. `test_every_runner_groups_parallel_tests_by_file` first
    searched whole files, and deleting `--dist loadfile` from test.sh left the
    words behind in the comment *explaining* the flag -- so the check passed
    over its own subject. The same defect had already been found and fixed in
    words behind in the comment *explaining* the flag -- so the check passed
    over its own subject. A text match cannot tell code from a note about
    code; where the check must be textual, strip the notes first.
    """
    return "\n".join(
        line
        for line in path.read_text().splitlines()
        if not line.lstrip().startswith(("#", "REM ", "rem "))
    )


# ---------------------------------------------------------------------------
# 1. Permission modes
# ---------------------------------------------------------------------------


def test_no_test_compares_a_raw_permission_mode_outside_the_oracle():
    """A 0600/0700 assertion has to go through posix_modes.assert_owner_only.

    One call site is what lets the promise be changed in one place: the app's
    0600/0700 guarantee is asserted from six modules, and a container bind
    mount is already where it stops being purely the app's to keep. Written as
    a source walk because the defect is textual -- `oct(p.stat().st_mode &
    0o777) == "0o600"` is a perfectly ordinary-looking line with nothing at
    runtime to catch it.
    """
    offenders = []
    for path in sorted(TESTS_DIR.glob("*.py")):
        if path.name in (MODE_ORACLE, THIS_FILE):
            continue
        for number, line in enumerate(path.read_text().splitlines(), start=1):
            if _RAW_MODE_ASSERTION.search(line):
                offenders.append(f"{path.name}:{number}: {line.strip()}")

    assert not offenders, (
        "these compare a raw permission mode by hand; use "
        "posix_modes.assert_owner_only:\n  " + "\n  ".join(offenders)
    )


def test_no_test_module_shadows_a_stdlib_module():
    """`tests/` is on sys.path, so tests/<stdlib name>.py shadows the stdlib
    for the whole run -- `tests/platform.py` would replace `import platform`
    everywhere, silently.

    posix_modes.py is named that and not platform.py for exactly this reason.
    Drop an empty tests/queue.py and the suite stays green while `import queue`
    resolves to it.
    """
    shadow = {p.stem for p in TESTS_DIR.glob("*.py")} & set(sys.stdlib_module_names)
    assert not shadow, (
        f"these live in tests/ (on sys.path) and shadow a stdlib module for the "
        f"whole suite: {sorted(shadow)}"
    )


# ---------------------------------------------------------------------------
# 2. Reserved device names
#
# CON, PRN, AUX, NUL, COM1-9 and LPT1-9 cannot be used as a file or directory
# name on Windows, with or without an extension, in any case. os.mkdir("NUL")
# raises there and succeeds everywhere else.
#
# The reachable path is not an analyst typing "NUL" into the Case ID field.
# sanitize_case_id's own docstring names the second caller: it is "also used
# for the folder name derived from an imported .iccase filename, which is just
# as untrusted as the Case ID field". So NUL.iccase is untrusted input that
# becomes a directory name.
#
# The app no longer *runs* on Windows, and this screen still stays. A Windows
# analyst reaches it through Docker Desktop, where a bind mount rooted at a
# Windows path lands on NTFS through the 9p/virtiofs share -- unverified here
# (nobody on this project has a Windows host), which is the argument for
# keeping a stable, cheap screen rather than for deleting one on a guess. On
# WSL2's own ext4 it is inert.
# ---------------------------------------------------------------------------


def test_every_runner_groups_parallel_tests_by_file():
    """`-n auto` must be paired with `--dist loadfile`, everywhere.

    xdist's default (`--dist load`) hands out individual tests, so two tests in one
    file can land on different workers. That breaks any file whose tests share
    warm-up state.

    **The grouping masks a real order dependence rather than fixing it**, which is
    why it needs a test: it is one flag, it looks like tuning, and dropping it
    produces an *intermittent* failure in a file nobody was editing.

    Checked across both runners because they drift independently.

    **Matched on the flag, not on `-n`.** A substring test for `-n` finds
    `[ -n "$one" ]`, which is the shell's string test and appears three times in
    `verify.sh`'s summary -- so the check reported a runner that passes pytest no
    xdist flag at all as running it unsafely, and the remedy it printed would
    have added a flag to a serial run.
    """
    runners = {
        "test.sh": REPO_ROOT / "test.sh",
        "verify.sh": REPO_ROOT / "verify.sh",
    }
    offenders = []
    for name, path in runners.items():
        code = _without_comments(path)
        if not re.search(r"(?:^|\s)-n\s+(?:auto|\d+)|numprocesses", code):
            continue
        # Either spelling: the shells write one string, the Python runner
        # separate argv entries.
        if "--dist loadfile" not in code and '"--dist", "loadfile"' not in code:
            offenders.append(name)

    assert not offenders, (
        f"{offenders} run pytest in parallel without --dist loadfile, so a "
        "file's tests can be split across workers. See this test's docstring."
    )


def test_vitest_allows_for_a_filesystem_slower_than_the_developer_machine():
    """The 5s default is a macOS number, and the frontend tier runs elsewhere.

    Tests time out under it inside the dev container, `structure.test.ts` first,
    which walks `ui/src` per assertion. That file runs in well under a second
    alone and several seconds in a full parallel run, because the workspace is a
    bind mount and every worker is crossing it at once -- so the tier fails
    intermittently rather than reproducibly.

    **A structural assertion's timeout carries no information** -- it is not
    measuring latency, so the only thing a tight budget can report is the
    machine. The failure is also the expensive kind: it names three unrelated
    tests, none of which mention the filesystem, and reads as a broken tree.

    Pinned rather than left in the config, for the reason above it: one line
    that looks like tuning, and dropping it produces an intermittent failure
    somewhere nobody was editing.
    """
    config = _without_comments(REPO_ROOT / "ui" / "vite.config.ts")
    match = re.search(r"testTimeout:\s*(\d+)", config)
    assert match, "ui/vite.config.ts sets no testTimeout, so vitest uses 5000ms"
    assert int(match.group(1)) >= 15000, (
        f"testTimeout is {match.group(1)}ms; the measured worst case in the "
        "container is 8.9s and that was not the ceiling."
    )


# ---------------------------------------------------------------------------
# 4. The test client's HTTP backend
# ---------------------------------------------------------------------------


