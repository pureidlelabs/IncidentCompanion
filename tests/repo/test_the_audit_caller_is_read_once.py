"""The audit's caller is read by one decorator, not assembled per handler."""

from __future__ import annotations

import re

from tests._repo import REPO_ROOT

ROOT = REPO_ROOT
SOURCE = ROOT / "server" / "src"

DECORATOR = SOURCE / "install-activity" / "caller.ts"

# The identifier is bound rather than spelled, so a handler taking `req` is the
# same object under another name.
HAND_BUILT = re.compile(r"headers:\s*(\w+)\.headers,\s*request(?::\s*\1)?\s*,?\s*\}")


def test_only_the_decorator_builds_the_caller() -> None:
    offenders = []
    for path in sorted(SOURCE.rglob("*.ts")):
        if path == DECORATOR:
            continue
        # Collapsed, so the same object split over lines is still the same object.
        if HAND_BUILT.search(re.sub(r"\s+", " ", path.read_text(encoding="utf-8"))):
            offenders.append(str(path.relative_to(ROOT)))

    assert not offenders, (
        "the audit caller is built by hand here; take `@Caller()` from "
        f"{DECORATOR.relative_to(ROOT)} instead:\n  " + "\n  ".join(offenders)
    )


def test_the_decorator_is_where_the_rule_points() -> None:
    """The exemption above is a path, and a moved file would silence the rule."""
    assert DECORATOR.is_file(), DECORATOR
