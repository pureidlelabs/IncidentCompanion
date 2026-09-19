"""Vite will serve a worktree's linked dependencies, and still serve its root.

A worktree links `node_modules` from the main checkout rather than installing
its own, so a module resolves to a path outside the client root and Vite's file
server refuses it. The story tier reaches that first, and the refusal arrives as
every `*.stories.tsx` failing to import its setup file.

**Asked of Vite rather than of the file.** `server.fs.allow` replaces rather
than extends -- `allow: raw?.fs?.allow ?? [workspaceRoot]` -- so a config that
names the linked directories and nothing else drops the root, and a check that
matched the source text passed with the whole declaration commented out. This
resolves the config and reads the list Vite actually computed. -> #894
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest

from tests._repo import REPO_ROOT

UI = REPO_ROOT / "ui"

#: Resolve the config the way Vite does when it serves, and hand back the list.
READ_THE_ALLOW_LIST = """
import { resolveConfig } from 'vite'
const config = await resolveConfig({ configFile: 'vite.config.ts' }, 'serve')
console.log(JSON.stringify(config.server.fs.allow))
"""


def allow_list() -> list[str]:
    """What Vite computes for `server.fs.allow`, or a skip when it cannot run."""
    if not (UI / "node_modules").exists():
        pytest.skip("ui/node_modules is absent, so vite cannot be loaded to answer")
    done = subprocess.run(
        ["node", "--input-type=module", "-e", READ_THE_ALLOW_LIST],
        cwd=UI, capture_output=True, text=True, check=False, timeout=180,
    )
    assert done.returncode == 0, f"vite could not resolve the config:\n{done.stderr}"
    return [os.path.realpath(one) for one in json.loads(done.stdout)]


def test_a_linked_node_modules_is_servable() -> None:
    """The directory behind the link, which is what a module resolves to."""
    behind = os.path.realpath(REPO_ROOT / "node_modules")
    assert behind in allow_list(), (
        f"vite will not serve {behind}, so in a worktree every story file fails to "
        "import its setup and the story tier cannot run at all"
    )


def test_the_client_root_is_still_servable() -> None:
    """Declaring the list replaces Vite's own entry, so the root must be named.

    Without this, a file under the root is served only where the module graph
    already reached it -- the app and the story tier stay green while a cold
    request for a source file, a sourcemap or an aliased path answers 403.
    """
    allowed = allow_list()
    root = os.path.realpath(REPO_ROOT)
    assert any(one == root or root.startswith(one + os.sep) or one.startswith(root + os.sep)
               for one in allowed), (
        f"no entry in {allowed} covers the project root {root}, so `searchForWorkspaceRoot` "
        "is no longer in the allow list and Vite's own default was dropped with it"
    )
