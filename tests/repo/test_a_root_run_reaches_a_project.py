"""A suite typed at the repository root runs under a project's own config.

**Without a configuration at the root, a root invocation runs on vitest's
defaults and loads none of the project configs.** `server/vitest.config.mts` is
what execs `stack.mjs` and fills the environment, so an unconfigured root run
reaches `bootable()` with no `DATABASE_URL`, the tier declines exactly as it is
designed to, and the run is green. Measured before this file existed:

    $ npx vitest run server/test/session-cache.test.ts
     Test Files  1 skipped (1)
          Tests  3 skipped (3)     rc=0

    $ cd server && npx vitest run test/session-cache.test.ts
          Tests  3 passed (3)

This is the sixth way into #61, and the one its own `declined()` helper cannot
see: from the root there really is no database to reach, so the decline is
honest and the cause is that the run never asked the stack for anything.

The root is where an agent stands, which is what makes the silent half matter.
A missing `cwd` fails loudly with `ENOENT`; a missing root config does not fail
at all.
"""

from __future__ import annotations

import re

from tests._repo import REPO_ROOT

#: Where a root run picks up its projects.
CONFIG = REPO_ROOT / "vitest.config.mts"

#: The tier that declines silently without a filled environment.
NEEDS_A_PROJECT = "server"


def test_the_repository_root_carries_a_vitest_config() -> None:
    """The artefact whose absence puts the silent skip back."""
    assert CONFIG.exists(), (
        "no vitest config at the repository root, so `npx vitest run server/test/x` "
        "loads no project config, finds no DATABASE_URL and reports the tier skipped "
        "with rc=0 while the stack is up"
    )


def test_the_server_tier_is_named_as_a_project() -> None:
    """Naming the directory is what makes a path resolve under its own config."""
    text = CONFIG.read_text(encoding="utf-8")

    projects = re.search(r"projects:\s*\[(.*?)\]", text, re.DOTALL)
    assert projects, "the root config declares no `projects`, so it delegates to nothing"

    assert NEEDS_A_PROJECT in projects.group(1), (
        f"`{NEEDS_A_PROJECT}` is not among the root config's projects, so a path under "
        f"it resolves on vitest's defaults and its suite declines for want of an "
        f"environment the project config would have filled"
    )
