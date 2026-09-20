# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only

"""The story tier's meter exclusion says which axe-core it was measured against.

`ui/.storybook/preview.tsx` takes every axe rule off `[data-part="meter"]`:
React Aria's `useMeter` returns the role list `meter progressbar`, and axe
resolves it to neither, then refuses the value attributes both roles permit
alone. The version is here so a bump reopens the question. -> #925
"""
from __future__ import annotations

import json

from tests._repo import REPO_ROOT

LOCK = REPO_ROOT / "package-lock.json"
PREVIEW = REPO_ROOT / "ui" / ".storybook" / "preview.tsx"

MEASURED_AGAINST = "4.13.0"

EXCLUDED = '[data-part="meter"]'


def _locked(name: str) -> str | None:
    packages = json.loads(LOCK.read_text(encoding="utf-8"))["packages"]
    entry = packages.get(f"node_modules/{name}")
    return entry.get("version") if entry else None


def test_the_exclusion_and_the_version_it_was_measured_against_travel_together():
    installed = _locked("axe-core")
    assert installed is not None, "the lock file holds no axe-core to measure against"
    assert installed == MEASURED_AGAINST, (
        f"axe-core moved to {installed} and the meter exclusion in "
        f"{PREVIEW.name} was measured against {MEASURED_AGAINST}. Re-run the "
        f"three-role measurement on #925: if `meter progressbar` is clean in "
        f"{installed}, delete the exclusion, this file and #925. If it still "
        f"refuses the value attributes, raise MEASURED_AGAINST to say the "
        f"exclusion was re-measured rather than carried forward unread.")


def test_the_exclusion_is_still_the_thing_this_version_was_recorded_for():
    assert EXCLUDED in PREVIEW.read_text(encoding="utf-8"), (
        f"{PREVIEW.name} no longer excludes {EXCLUDED}, so the version pinned "
        f"here is recorded against nothing. Delete this file with it.")
