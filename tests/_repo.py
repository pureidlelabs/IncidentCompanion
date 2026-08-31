"""The repository root, defined once.

**No test may compute this from `__file__`.** A root derived by counting
directories changes meaning the moment the file moves, and it does so in two
ways — one loud, one not:

- A concrete path stops resolving. `REPO_ROOT / ".github" / "workflows"` raises
  `FileNotFoundError`, which at least says so.
- A *sweep* keeps working over the wrong directory. `TESTS_DIR.glob("*.py")`
  found a real folder with real files in it and every assertion passed, while
  the directory it was written to protect went unguarded.

The second is why this module exists rather than a lint rule about levels.
Measured 2026-08-16: moving one file two directories deep silently disarmed a
stdlib-shadow sweep and a file-mode oracle, and neither raised.

So: import `REPO_ROOT` from here, and name the tree you want off it.
`tests/_repo.py` sits one level under the repository by construction, and that
fact is asserted below rather than assumed.
"""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

#: Files that exist in every checkout, at the root, and would not exist one
#: level up or down. The assertion is what makes the constant above safe to
#: trust after somebody moves this file.
_ANCHORS = ("pyproject.toml", "test.sh", "compose.yaml")

_missing = [name for name in _ANCHORS if not (REPO_ROOT / name).exists()]
if _missing:
    raise RuntimeError(
        f"tests/_repo.py resolved REPO_ROOT to {REPO_ROOT}, which is missing "
        f"{_missing}. This file has moved; fix the constant rather than the "
        "callers, which is the whole point of it living in one place."
    )

#: The trees a test is likely to want, so a caller names a subject rather than
#: rebuilding a path.
APP = REPO_ROOT / "app"
SERVER = REPO_ROOT / "server"
UI = REPO_ROOT / "ui"
DOCKER = REPO_ROOT / "docker"
DOCS = REPO_ROOT / "docs"
TESTS = REPO_ROOT / "tests"

__all__ = ["REPO_ROOT", "APP", "SERVER", "UI", "DOCKER", "DOCS", "TESTS"]
