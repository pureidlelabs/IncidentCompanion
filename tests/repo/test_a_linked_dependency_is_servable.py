"""Vite is told where a worktree's dependencies really live.

A worktree links `node_modules` from the main checkout rather than installing
its own, so a module resolves to a path outside the client root and Vite's file
server refuses it. The story tier reaches that first, and the refusal arrives as
every `*.stories.tsx` failing to import its setup file.

**Structural, because the tier that proves it cannot run where this does.** The
condition needs a `node_modules` that is a symbolic link, which is true of a
worktree and false of CI and of the main checkout -- so a behavioural test here
would pass without reproducing anything. What it guards is that the mechanism
is still wired: the allow list is fed by a resolver that follows links, not by
a literal somebody can quietly delete. -> #894
"""

from __future__ import annotations

import re

from tests._repo import REPO_ROOT

CONFIG = REPO_ROOT / "ui" / "vite.config.ts"


def test_the_file_server_takes_an_allow_list() -> None:
    """`server.fs.allow`, fed by the resolved list rather than by a literal."""
    text = CONFIG.read_text(encoding="utf-8")
    wired = re.compile(r"fs:\s*\{\s*allow:\s*\[\s*\.\.\.LINKED_DEPENDENCIES")
    assert wired.search(text) is not None, (
        f"{CONFIG.name} no longer feeds `server.fs.allow` from the resolved dependency "
        "list, so a worktree's linked node_modules is outside what Vite will serve and "
        "every story file fails to import its setup."
    )


def test_the_list_follows_the_link() -> None:
    """`realpathSync`, which is the whole point: a link's own path is not servable."""
    text = CONFIG.read_text(encoding="utf-8")
    assert "LINKED_DEPENDENCIES" in text, f"{CONFIG.name} no longer declares the list"
    declared = text.split("const LINKED_DEPENDENCIES", 1)[1].split("\n\n", 1)[0]
    assert "realpathSync" in declared, (
        "the dependency list no longer resolves the link, so in a worktree it names the "
        f"link's own path and Vite refuses the directory behind it:\n{declared}"
    )
