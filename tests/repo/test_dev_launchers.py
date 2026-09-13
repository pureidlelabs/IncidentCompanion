"""Every flag a launcher documents is a flag it parses.

**The failure is silent in both directions.** A usage block can name a flag
the `case` statement has no branch for, and the script then answers `unknown
option` and exits 2 against its own documented interface; or the parser can
grow a flag the header never mentions, which is a flag nobody reaches for. The
header reads as a contract and nothing but this checks it.

Assertable, so it is a test rather than a note: the usage block and the parser
are two lists in one file, and a test is the only thing that keeps them equal.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from tests._repo import REPO_ROOT

ROOT = REPO_ROOT
#: The launchers with a usage block. `test.sh` takes pytest's own arguments and
#: parses none of its own, so it declares nothing to check.
#:
#: **One launcher, and it is the dev one.** A second entry belongs here only
#: if something other than `docker compose` starts the product, since a
#: compose file declares no flags of its own to keep in step.
LAUNCHERS = ("dev-node.sh",)


def _documented(text: str) -> set[str]:
    """Flags named in the leading comment block, before the first real line."""
    header: list[str] = []
    for line in text.splitlines():
        if line.startswith("#!"):
            continue
        if line.startswith("#") or not line.strip():
            header.append(line)
            continue
        break
    # Only the usage lines: `#   ./dev-node.sh --flag   what it does`. Prose in
    # the same block mentions flags too, and a mention is not a promise.
    flags: set[str] = set()
    for line in header:
        if "./" not in line:
            continue
        flags.update(re.findall(r"(--[a-z][a-z-]*)", line))
    return flags


def _parsed(text: str) -> set[str]:
    """Flags the `case` statement has a branch for."""
    body = text.split("case", 1)[-1]
    return set(re.findall(r"^\s*(--[a-z][a-z-]*)\)", body, re.MULTILINE))


@pytest.mark.parametrize("name", LAUNCHERS)
def test_every_documented_flag_is_parsed(name: str) -> None:
    text = (ROOT / name).read_text(encoding="utf-8")
    documented = _documented(text)
    assert documented, f"{name} documents no flags -- the usage block moved"

    missing = documented - _parsed(text)
    assert not missing, (
        f"{name} documents {sorted(missing)} and its case statement has no "
        f"branch for them, so the script answers 'unknown option' and exits 2"
    )


@pytest.mark.parametrize("name", LAUNCHERS)
def test_every_parsed_flag_is_documented(name: str) -> None:
    """The other direction: an undocumented flag is one nobody will use."""
    text = (ROOT / name).read_text(encoding="utf-8")
    undocumented = _parsed(text) - _documented(text)
    assert not undocumented, (
        f"{name} parses {sorted(undocumented)} and its usage block does not "
        f"mention them"
    )
