"""A hook that boots the app carries a budget, or its cases skip in silence.

**A vitest hook that times out skips its tests rather than failing them.** A
`beforeAll` calling `boot()` with no timeout takes the 10s default, which a
loaded machine exceeds; the hook times out, the run reports the file's cases as
skipped, and it exits 0.

That is #61's shape arriving through a hook rather than through a missing
service, and the tier's own `declined()` mechanism cannot see it -- `bootable()`
succeeds, and it is `boot()` that runs out of time. Nothing else can see it
either: the summary says skipped, the exit code says fine, and the file has
asserted nothing.

The fix is one argument each; this is what stops the next one.
"""

from __future__ import annotations

import re

from tests._repo import REPO_ROOT

#: Where a booted-app suite can live. Both tiers, because `src` holds some.
ROOTS = ("server/test", "server/src")

#: `}, 90_000)` and friends -- the closing of a hook that was given a budget.
CLOSES_WITH_BUDGET = re.compile(r"\n  \}(, ?[0-9_]+)?\)")


def _hooks_that_boot() -> list[tuple[str, bool]]:
    """Every `beforeAll` that calls `boot()`, and whether it carries a budget."""
    found: list[tuple[str, bool]] = []
    for root in ROOTS:
        for path in sorted((REPO_ROOT / root).rglob("*.test.ts")):
            text = path.read_text(encoding="utf-8")
            at = text.find("await boot(")
            if at == -1:
                continue
            opened = text.rfind("beforeAll(", 0, at)
            if opened == -1:
                continue
            closing = CLOSES_WITH_BUDGET.search(text[opened:])
            budgeted = bool(closing and closing.group(1))
            found.append((str(path.relative_to(REPO_ROOT)), budgeted))
    return found


def test_there_are_booted_suites_to_check() -> None:
    """The vacuity guard: a rename of `boot` leaves this sweeping nothing."""
    assert len(_hooks_that_boot()) > 5, (
        "no test file boots the app in a beforeAll, so this rule covers nothing"
    )


def test_every_hook_that_boots_the_app_carries_a_budget() -> None:
    """Booting takes longer than vitest's 10s default whenever the machine is busy."""
    without = [path for path, budgeted in _hooks_that_boot() if not budgeted]

    assert not without, (
        "these boot the app in a beforeAll with no timeout, so vitest's 10s default "
        "applies -- and a hook that times out SKIPS its cases and exits 0, which "
        "reads as a pass:\n" + "\n".join(f"  {one}" for one in without)
    )
