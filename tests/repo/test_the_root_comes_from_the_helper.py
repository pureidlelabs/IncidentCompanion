"""`tests/_repo.py` is the one module allowed to derive the repository root,
and its own docstring says why.
"""

from __future__ import annotations

import pathlib
import re

from tests._repo import TESTS

#: This file is exempt because it quotes the pattern it hunts for.
ALLOWED = frozenset({"_repo.py", pathlib.Path(__file__).name})

_DERIVED_ROOT = re.compile(r"__file__.*parents\[")


def test_no_test_module_derives_the_repository_root() -> None:
    offenders = [
        f"{path.relative_to(TESTS)}:{number}: {line.strip()}"
        for path in sorted(TESTS.rglob("*.py"))
        if path.name not in ALLOWED
        for number, line in enumerate(
            path.read_text(encoding="utf-8").splitlines(), start=1)
        if _DERIVED_ROOT.search(line)
    ]
    assert not offenders, (
        "these count directories from __file__; import REPO_ROOT from "
        "tests._repo instead:\n  " + "\n  ".join(offenders))
