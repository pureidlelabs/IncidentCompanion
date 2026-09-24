"""*Most permissive applies* is settled in the store, and the ordering declared once in the application.

A second copy of either compiles, passes, and disagrees only on the level
somebody adds later -- which is the re-decision Article III refuses. The store
spells the ordering in its own language, so that copy is held to the
application's rather than forbidden.

Each check names the file that holds the needle as well as the files that must
not, so emptying the home fails rather than passing for want of anything to
find.

What this cannot see is a copy spelled differently: an ordering assembled at
run time, or a comparison written as a chain of conditions. Nor a copy inside a
test, which is excluded -- a test cannot fail open into the product.
"""

from __future__ import annotations

from pathlib import Path

from tests._repo import REPO_ROOT

SERVER = "server/src"

#: The levels, weakest first. Position in this array is the comparison.
ORDERING = "['read', 'write', 'delete']"


def _sources() -> list[Path]:
    found = [
        path
        for pattern in ("*.ts", "*.sql")
        for path in sorted((REPO_ROOT / SERVER).rglob(pattern))
        if not path.name.endswith(".test.ts")
    ]
    assert len(found) > 100, f"{SERVER} walked {len(found)} files, so this test guards nothing"
    return found


def _homes(needle: str) -> list[str]:
    return [
        str(path.relative_to(REPO_ROOT))
        for path in _sources()
        if needle in path.read_text(encoding="utf-8")
    ]


def _lives_only_in(needle: str, home: str, instead: str) -> None:
    found = _homes(needle)
    assert found, f"nothing under {SERVER} spells {needle} any more, so {home} is not its home"
    assert found == [home], (
        f"{needle} is spelled outside {home}, so it has more than one home: "
        + ", ".join(one for one in found if one != home)
        + f"\n{instead}"
    )


def test_the_ordering_is_declared_once() -> None:
    """A second array is a second answer to *which level is stronger*."""
    _lives_only_in(
        f"= {ORDERING}", f"{SERVER}/db/schema/groups.ts", "import LEVELS instead"
    )
    _lives_only_in(
        f"array{ORDERING}",
        f"{SERVER}/db/reach.sql",
        "ask ic_level instead, which is the store's one ordering",
    )


def test_the_rule_is_settled_in_one_file() -> None:
    """Comparing levels by hand is how a floor gets dropped in one place only."""
    _lives_only_in(
        "array_position(",
        f"{SERVER}/db/reach.sql",
        "ask ic_level instead, which is where the floor is applied",
    )
    assert not _homes("strongest("), (
        "a level is settled in the application again: "
        + ", ".join(_homes("strongest("))
        + "\nask ic_level, which the policies ask"
    )
