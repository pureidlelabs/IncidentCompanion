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

#: The highest slot `stack.mjs` hands out.
MAX_SLOT = 40

SLOT: int = json.loads(subprocess.run(
    ["node", str(REPO_ROOT / "server" / "scripts" / "stack.mjs"), "--json"],
    capture_output=True, text=True, check=True).stdout)["slot"]

IMAGE_TAG = "local" if SLOT == 0 else f"slot{SLOT}"

#: What every `docker compose` a tier runs must carry, or it builds `:local`.
ENV = {"IC_IMAGE_TAG": IMAGE_TAG}

#: A tier's first port. 100 apart, and a slot moves every tier by 300, so no
#: tier, slot and worker below 100 lands on another's.
PORT_BASE = {"runtime": 18443, "ingress": 18543, "lockout": 18643}

def _worker() -> int:
    return int(os.environ.get("PYTEST_XDIST_WORKER", "gw0").removeprefix("gw"))


def image(name: str) -> str:
    return f"incidentcompanion-{name}:{IMAGE_TAG}"


def project(tier: str) -> str:
    return f"incidentcompanion-{tier}-test-{SLOT}-gw{_worker()}"


def port(tier: str, slot: int = SLOT, worker: int | None = None) -> int:
    return PORT_BASE[tier] + slot * 300 + (_worker() if worker is None else worker)
