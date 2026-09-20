# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only

"""The focus hook in the client setup says which jsdom it was measured against.

`ui/src/test/setup.ts` focuses and blurs a scratch element after every test,
because jsdom 30.1.0 leaves its focus pointer on the document when a focused
element is removed. It is upstream's and it is filed twice --
<https://github.com/jsdom/jsdom/issues/4344> and #4347.

A workaround is only ever right for the version it was measured against, so the
version is written here: Renovate moves jsdom, this goes red, and whoever takes
it asks whether the fix shipped. -> #1001
"""
from __future__ import annotations

import json

from tests._repo import REPO_ROOT

LOCK = REPO_ROOT / "package-lock.json"
SETUP = REPO_ROOT / "ui" / "src" / "test" / "setup.ts"

#: Raise only after re-running `cd ui && npx vitest run --project=unit`.
MEASURED_AGAINST = "30.1.0"

SCRATCH = "scratch"


def _locked(name: str) -> str | None:
    packages = json.loads(LOCK.read_text(encoding="utf-8"))["packages"]
    entry = packages.get(f"node_modules/{name}")
    return entry.get("version") if entry else None


def test_the_hook_and_the_version_it_was_measured_against_travel_together():
    installed = _locked("jsdom")
    assert installed is not None, "the lock file holds no jsdom to measure against"
    assert installed == MEASURED_AGAINST, (
        f"jsdom moved to {installed} and the focus hook in {SETUP.name} was "
        f"measured against {MEASURED_AGAINST}. The upstream reports are "
        f"jsdom/jsdom#4344 and #4347: if the fix shipped in {installed}, delete "
        f"the hook, `ui/src/test/jsdom-focus.test.ts`, this file and #1001 once "
        f"`cd ui && npx vitest run --project=unit` is green without them. If the "
        f"pointer is still stale, raise MEASURED_AGAINST to say the hook was "
        f"re-measured rather than carried forward unread.")


def test_the_hook_is_still_the_thing_this_version_was_recorded_for():
    """A version recorded for a hook that has gone says nothing at all."""
    assert SCRATCH in SETUP.read_text(encoding="utf-8"), (
        f"{SETUP.name} no longer creates a {SCRATCH} element, so the version "
        f"pinned here is recorded against nothing. Delete this file with it.")
