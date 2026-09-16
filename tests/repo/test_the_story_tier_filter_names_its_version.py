# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only

"""The story tier's react-aria filter says which version it was measured against.

`ui/vite.config.ts` drops exactly one unhandled error: react-aria reaching
`Node.contains` with a `Window` on a focus event, which fails a run in which
every test passed. It is upstream's and it is filed --
<https://github.com/adobe/react-spectrum/issues/10591>, a regression in
`react-aria@3.52.0` whose fix is open and unmerged at
<https://github.com/adobe/react-spectrum/pull/10592>.

A suppression is only ever right for the version it was measured against, and
this one had no trigger: nothing said when to look again, so a fixed upstream
would leave a filter standing that also swallows a real `contains` throw.

The version is written here so a bump reopens the question. Renovate moves
react-aria, this goes red, and whoever takes it asks whether the fix shipped.
-> #429
"""
from __future__ import annotations

import json

from tests._repo import REPO_ROOT

LOCK = REPO_ROOT / "package-lock.json"
CONFIG = REPO_ROOT / "ui" / "vite.config.ts"

#: The version the throw was last reproduced against. Raise it only after
#: re-running `cd ui && npx vitest run --project=storybook`.
MEASURED_AGAINST = "3.52.1"

#: What `ui/vite.config.ts` calls the filter.
FILTER = "ignoreReactAriaWindowFocusThrow"


def _locked(name: str) -> str | None:
    packages = json.loads(LOCK.read_text(encoding="utf-8"))["packages"]
    entry = packages.get(f"node_modules/{name}")
    return entry.get("version") if entry else None


def test_the_filter_and_the_version_it_was_measured_against_travel_together():
    installed = _locked("react-aria")
    assert installed is not None, "the lock file holds no react-aria to measure against"
    assert installed == MEASURED_AGAINST, (
        f"react-aria moved to {installed} and the story tier's {FILTER} was "
        f"measured against {MEASURED_AGAINST}. The upstream fix is "
        f"adobe/react-spectrum#10592: if it shipped in {installed}, run "
        f"`cd ui && npx vitest run --project=storybook` and delete the filter, "
        f"this file and #429 once no unhandled error naming "
        f"`isFocusMovingToTarget` is printed. If it still throws, raise "
        f"MEASURED_AGAINST to say the filter was re-measured rather than "
        f"carried forward unread.")


def test_the_filter_is_still_the_thing_this_version_was_recorded_for():
    """A version recorded for a filter that has gone says nothing at all."""
    assert FILTER in CONFIG.read_text(encoding="utf-8"), (
        f"{FILTER} is gone from ui/vite.config.ts, so nothing in the story tier "
        f"drops the react-aria focus throw and this file records a version for "
        f"a filter that no longer exists. Delete this file with #429.")
