# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only

"""The workspace root states which node and npm an install needs.

`engines` beside the lock file is what Renovate reads to decide which npm it
runs. `server/` and `ui/` state their own node and a workspace install reaches
neither, so the root is the only copy that is read.

**Whether Renovate then succeeds is not checked here**, and no test can: that
is answerable only from a Renovate run. -> #468
"""
from __future__ import annotations

import json
import re

from tests._repo import REPO_ROOT

ROOT_MANIFEST = REPO_ROOT / "package.json"
MISE = REPO_ROOT / ".devcontainer" / "mise.toml"
DEV_DOCKERFILE = REPO_ROOT / ".devcontainer" / "Dockerfile"


def _engines() -> dict[str, str]:
    return json.loads(ROOT_MANIFEST.read_text(encoding="utf-8")).get("engines", {})


def _floor(tool: str) -> int:
    """The major the root's `>=<major>` constraint for `tool` admits from."""
    constraint = _engines().get(tool)
    assert constraint, f"the workspace root declares no engines.{tool}"
    match = re.fullmatch(r">=\s*(\d+)", constraint.strip())
    assert match, (
        f"engines constraint {constraint!r} is not the `>=<major>` form this "
        f"check reads; state the floor rather than a pin, so Renovate tracking "
        f"the pinned tool cannot leave the two disagreeing")
    return int(match.group(1))


def test_the_root_states_the_node_and_npm_an_install_needs():
    engines = _engines()
    for tool in ("node", "npm"):
        assert tool in engines, (
            f"the workspace root declares no engines.{tool}, so Renovate "
            f"chooses the {tool} it updates package-lock.json with")


def test_the_stated_node_admits_the_one_the_container_runs():
    pinned = re.search(r'^node\s*=\s*"(\d+)\.', MISE.read_text(encoding="utf-8"), re.MULTILINE)
    assert pinned, ".devcontainer/mise.toml pins no node"
    floor = _floor("node")
    assert floor == int(pinned.group(1)), (
        f"the root admits node from {floor} while the container runs "
        f"{pinned.group(1)}.x -- Renovate would install a node this tree is "
        f"never built on")


def test_the_stated_npm_admits_the_one_the_container_installs():
    """Admits it rather than equals it: two npm majors build this tree.

    The container installs the `ARG NPM_VERSION` it pins, and CI takes whatever
    ships with the node in `ui/.nvmrc`. A floor above either is a floor nothing
    here is built under.
    """
    pinned = re.search(r"^ARG NPM_VERSION=(\d+)\.", DEV_DOCKERFILE.read_text(encoding="utf-8"), re.MULTILINE)
    assert pinned, ".devcontainer/Dockerfile pins no NPM_VERSION"
    floor = _floor("npm")
    assert floor <= int(pinned.group(1)), (
        f"the root admits npm from {floor} while the container installs "
        f"{pinned.group(1)}.x -- the lock file would be written by one npm and "
        f"read by another")
