from __future__ import annotations

import pathlib
import re

from tests._repo import TESTS

#: Relative to `TESTS`: by basename, a second `_repo.py` anywhere under the
#: tree would inherit the exemption. `_repo.py` holds the one legitimate
#: derivation; this file quotes the pattern it hunts for.
ALLOWED = frozenset({
    "_repo.py",
    str(pathlib.Path(__file__).resolve().relative_to(TESTS).as_posix()),
})

_FILE = re.compile(r"__file__")

#: A chain of two: one `.parent` is the file's own directory, which is
#: legitimate. Matched apart from `__file__` because `dirname` takes it as an
#: argument, so the two fall either way round on the line.
_CLIMB = re.compile(r"parents\[|(?:\.parent){2,}|\bdirname\s*\(")


def test_no_test_module_derives_the_repository_root() -> None:
    walked = 0
    offenders = []
    for path in sorted(TESTS.rglob("*.py")):
        if str(path.relative_to(TESTS).as_posix()) in ALLOWED:
            continue
        walked += 1
        for number, line in enumerate(
                path.read_text(encoding="utf-8").splitlines(), start=1):
            if _FILE.search(line) and _CLIMB.search(line):
                offenders.append(
                    f"{path.relative_to(TESTS)}:{number}: {line.strip()}")

    assert walked, f"no files walked under {TESTS}; this guards nothing"
    assert not offenders, (
        "these derive the repository root from __file__; import REPO_ROOT "
        "from tests._repo instead:\n  " + "\n  ".join(offenders))
