"""*Most permissive applies* is settled in one file, and the ordering declared in one.

A second copy of the ordering compiles, passes, and disagrees only on the level
somebody adds later -- which is the re-decision Article III refuses.

What this cannot see is a copy spelled differently: an ordering built from
`LEVELS`, or a comparison written as a `switch`.
"""

from __future__ import annotations

from pathlib import Path

from tests._repo import REPO_ROOT

#: Where reach is resolved. Every other file here asks it.
ACCESS = REPO_ROOT / "server" / "src" / "access"

HOME = "reach.service.ts"

#: Weakest to strongest, as the source spells it.
ORDERING = "['read', 'write', 'delete']"


def _sources() -> list[Path]:
    found = [
        path
        for path in sorted(ACCESS.glob("*.ts"))
        if not path.name.endswith(".test.ts")
    ]
    assert found, f"{ACCESS} holds no sources, so this test guards nothing"
    assert ACCESS / HOME in found, f"{HOME} is gone, so this test names the wrong home"
    return found


def _elsewhere(needle: str) -> list[str]:
    return [
        path.name
        for path in _sources()
        if path.name != HOME and needle in path.read_text(encoding="utf-8")
    ]


def test_the_ordering_is_declared_once() -> None:
    """A second array is a second answer to *which level is stronger*."""
    copies = _elsewhere(ORDERING)
    assert not copies, (
        f"{ORDERING} is declared outside {HOME}, so the ordering has two homes: "
        + ", ".join(copies)
        + f"\nimport RANK from {HOME} instead"
    )


def test_the_rule_is_settled_in_one_file() -> None:
    """Comparing levels by hand is how a floor gets dropped in one place only."""
    copies = _elsewhere("strongest(")
    assert not copies, (
        f"strongest() is called outside {HOME}, so *most permissive applies* is "
        "implemented more than once: " + ", ".join(copies)
    )
