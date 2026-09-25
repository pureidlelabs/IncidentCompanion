"""The image tag, Compose projects and host ports a container tier runs under, apart per checkout.

Derived from the checkout's stack slot (`server/scripts/stack.mjs`), so two
worktrees on one daemon never share one. The main checkout is slot 0 and keeps
the tag an operator's `compose.yaml` builds.
"""

from __future__ import annotations

import json
import os
import subprocess

from tests._repo import REPO_ROOT


def _stack() -> dict:
    asked = subprocess.run(
        ["node", str(REPO_ROOT / "server" / "scripts" / "stack.mjs"), "--json"],
        capture_output=True, text=True)
    if asked.returncode != 0:
        raise RuntimeError(f"stack.mjs --json exited {asked.returncode}, so this checkout "
                           f"has no stack slot to name its containers by:\n{asked.stderr}")
    return json.loads(asked.stdout)


_STACK = _stack()
SLOT: int = _STACK["slot"]
MAX_SLOT: int = _STACK["maxSlot"]

#: A tier's first port. 100 apart, and a slot moves every tier by 300, so no
#: tier, slot and worker below 100 lands on another's.
PORT_BASE = {"runtime": 18443, "ingress": 18543, "lockout": 18643}


def _worker() -> int:
    return int(os.environ.get("PYTEST_XDIST_WORKER", "gw0").removeprefix("gw"))


def tag(slot: int) -> str:
    return "local" if slot == 0 else f"slot{slot}"


IMAGE_TAG = tag(SLOT)

#: What every `docker compose` a tier runs must carry, last, or it builds `:local`.
ENV = {"IC_IMAGE_TAG": IMAGE_TAG}


def image(name: str) -> str:
    return f"incidentcompanion-{name}:{IMAGE_TAG}"


def project(tier: str, slot: int = SLOT, worker: int | None = None) -> str:
    return f"incidentcompanion-{tier}-test-{slot}-gw{_worker() if worker is None else worker}"


def port(tier: str, slot: int = SLOT, worker: int | None = None) -> int:
    return PORT_BASE[tier] + slot * 300 + (_worker() if worker is None else worker)
