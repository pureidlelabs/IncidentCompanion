"""Every workspace pins the same TypeScript, so the tree compiles with one.

The trees share a lock file and npm hoists one copy, so two pins that disagree
resolve to one hoisted version plus a nested second for whichever package asked
for the other -- and each tree then typechecks against a different compiler
while both report green.

**The pin is also what a held major acts on.** Renovate offers the jump to the
latest major and nothing between, so a hold placed on `typescript` for the
sake of one tree freezes every tree behind it, including one the blocker has
nothing to do with.

What this does not check is which version is pinned, or whether it is current.
That is the dependency dashboard's, and the hold is argued in
`.github/renovate.json5`.
"""

from __future__ import annotations

import json

from tests._repo import REPO_ROOT

#: Where a workspace declares what it builds with.
MANIFESTS = ("package.json", "ui/package.json", "server/package.json")


def _pins() -> dict[str, str]:
    found: dict[str, str] = {}
    for name in MANIFESTS:
        path = REPO_ROOT / name
        if not path.exists():
            continue
        manifest = json.loads(path.read_text(encoding="utf-8"))
        for field in ("dependencies", "devDependencies"):
            pinned = manifest.get(field, {}).get("typescript")
            if pinned is not None:
                found[name] = pinned
    return found


def test_every_workspace_pins_one_typescript() -> None:
    """A second pin is a second compiler, whatever the lock file hoists."""
    pins = _pins()
    assert pins, "no workspace pins typescript at all, so this test guards nothing"
    assert len(set(pins.values())) == 1, (
        "these workspaces build with different TypeScript compilers:\n  "
        + "\n  ".join(f"{name}: {version}" for name, version in sorted(pins.items()))
    )
