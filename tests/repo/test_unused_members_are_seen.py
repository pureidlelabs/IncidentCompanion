"""The flags that are the only thing watching a class member in `server/`.

eslint's `no-unused-vars` skips class properties, so an injected field nothing
reads is caught by these two or by nothing at all. Dropping either costs no
lint error and no failing suite, which is the state that let four survive.
-> #631

Read as text rather than parsed: `server/tsconfig.json` carries comments, and
`json.loads` refuses them. `test_build_entry_point.py` reads `rootDir` the
same way.
"""

from __future__ import annotations

import re

import pytest

from tests._repo import REPO_ROOT


@pytest.mark.parametrize("flag", ["noUnusedLocals", "noUnusedParameters"])
def test_the_server_typecheck_refuses_an_unused_member(flag: str) -> None:
    config = (REPO_ROOT / "server" / "tsconfig.json").read_text(encoding="utf-8")
    assert re.search(rf'"{flag}":\s*true', config), (
        f"server/tsconfig.json no longer sets {flag}, so an unused member compiles clean"
    )
