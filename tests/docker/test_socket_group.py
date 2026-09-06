# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only

"""The docker socket's group is in the image, so no moment can be missed.

**Three placements were tried before this one and each lost a race**, measured
on the created container rather than reasoned about:

    runArgs ["--group-add", "${localEnv:IC_DOCKER_GID:0}"]  ->  GroupAdd=[]
    "containerUser": "vscode"                               ->  User=[root]
    onCreateCommand                                         ->  too late

The `:default` form resolved to empty and the flag was dropped; `containerUser`
was ignored outright; and the editor's `docker exec` starts *before*
`onCreateCommand` - measured on one create, 927.180 against 927.394, a margin
under 250ms either way, which is a race rather than a mechanism.

**In the image there is no moment.** `/etc/group` is baked in, so init has the
group, the `docker exec` that starts the server has it, and every terminal
below has it. Measured on this container's shape - init as root, the server
arriving by `docker exec -u vscode` - running the real `install.sh` against the
project's own base image:

    docker exec -u vscode  ->  1000 0
    a nested shell         ->  1000 0

`.devcontainer/features/socket-group` is a local feature rather than a
Dockerfile step because `common-utils` creates the user, and features install
after it.

**What these cases can see.** The config half is decidable here and is asserted
outright. The runtime half is only observable after a create, so it reports
this container's own credential - and says which of the two failures it is,
since a container awaiting a rebuild and a wrong gid need different answers.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path

import pytest

from tests._repo import REPO_ROOT

DEVCONTAINER = REPO_ROOT / ".devcontainer" / "devcontainer.json"
FEATURE = REPO_ROOT / ".devcontainer" / "features" / "socket-group"
SOCKET = Path("/var/run/docker.sock")


def declared() -> dict:
    """`devcontainer.json` as data. It carries `//` comments, which JSON does not."""
    raw = DEVCONTAINER.read_text(encoding="utf-8")
    return json.loads(re.sub(r"^\s*//.*$", "", raw, flags=re.MULTILINE))


def executable(path: Path) -> str:
    """A script with its comments stripped.

    **Read what runs, not what a sentence says about what used to run.** Every
    file this module checks explains at length which mechanisms were tried and
    rejected, and a grep cannot tell that prose from the line it describes -
    a mistake made three times on this branch, once in a test written to avoid
    exactly it.
    """
    return "\n".join(
        line for line in path.read_text(encoding="utf-8").split("\n")
        if not line.lstrip().startswith("#")
    )


def test_the_group_is_granted_in_the_image() -> None:
    """The feature is declared, and it is the thing that grants the group."""
    features = declared()["features"]
    assert "./features/socket-group" in features, (
        "devcontainer.json declares no socket-group feature, so nothing puts "
        "the user in the socket's group before the editor's server starts"
    )
    manifest = json.loads((FEATURE / "devcontainer-feature.json").read_text())
    assert "ghcr.io/devcontainers/features/common-utils" in manifest["installsAfter"], (
        "the feature must install after common-utils, which creates the user"
    )
    assert "usermod -aG" in executable(FEATURE / "install.sh"), "install.sh grants nothing"


def test_nothing_grants_it_later_as_well() -> None:
    """**A second grant is how a failed first one stays invisible.**

    A later placement looks like it works because an earlier mechanism is
    quietly compensating. The symptom is a split -- `db:up` succeeding through a
    re-exec while a plain `docker ps` fails -- which reads as a daemon that is
    somehow half up.
    """
    for name in ("post-start.sh", "post-create.sh", "clone-workspace.sh"):
        path = REPO_ROOT / ".devcontainer" / name
        if not path.is_file():
            continue
        assert "usermod -aG" not in executable(path), (
            f"{name} grants the group again, which cannot work from there and "
            f"would hide a build-time failure behind a partial repair"
        )


def rebuild_needed() -> str | None:
    """Why this container lacks the group, when it does: age, or a wrong gid."""
    wanted = SOCKET.stat().st_gid
    if wanted in os.getgroups():
        return None
    listed = subprocess.run(["getent", "group", str(wanted)],
                            capture_output=True, text=True)
    members = [one for one in listed.stdout.strip().split(":")[-1].split(",") if one]
    if os.environ.get("USER", "vscode") not in members:
        return (
            f"this container was built before the socket-group feature (group "
            f"{wanted} lists {members or 'nobody'}). Rebuild it; export "
            f"IC_DOCKER_GID={wanted} first if your socket is not root-owned."
        )
    return None


@pytest.mark.skipif(not SOCKET.exists(), reason="no docker socket bind-mounted here")
def test_this_session_holds_the_socket_group() -> None:
    """**The case that would have caught every one of the three wrong answers.**

    It skips only while the group is absent from the database entirely, which
    is a container older than the feature and a rebuild you schedule. It
    *fails* when the database lists this user and the session does not hold it -
    which is the placement failure itself, and what three commits got wrong.
    """
    rebuild = rebuild_needed()
    if rebuild:
        pytest.skip(rebuild)
    wanted = SOCKET.stat().st_gid
    assert wanted in os.getgroups(), (
        f"the group database lists this user in {wanted} and this session holds "
        f"{sorted(os.getgroups())}, so the grant landed after the session "
        f"started. It belongs in the image, where there is no moment to miss: "
        f"`.devcontainer/features/socket-group`."
    )


@pytest.mark.skipif(not SOCKET.exists(), reason="no docker socket bind-mounted here")
def test_an_ordinary_docker_call_reaches_the_daemon() -> None:
    """The credential is the point; this is what it is for.

    A plain subprocess with nothing sourced and no wrapper on PATH, because that
    is the shape a compensating mechanism leaves broken while every wrapped call
    still works.
    """
    rebuild = rebuild_needed()
    if rebuild:
        pytest.skip(rebuild)
    done = subprocess.run(
        ["docker", "version", "--format", "{{.Server.Version}}"],
        capture_output=True, text=True, timeout=30,
    )
    assert done.returncode == 0, (
        f"a plain `docker` call failed: {done.stderr.strip() or done.stdout.strip()}"
    )


def test_no_workaround_survives_beside_it() -> None:
    """Two mechanisms for one credential is how the wrong one stays in use.

    **A check on filenames catches only the workarounds that are files.** A
    `docker` shim on PATH and a sourced helper have names; a re-implementation
    inside `server/scripts/stack.mjs` does not. So this is on the mechanism:
    nothing re-execs docker through `sg` or `newgrp` to pick up a group it should
    already hold.
    """
    tracked = subprocess.run(
        ["git", "ls-files"], cwd=REPO_ROOT, capture_output=True, text=True, check=True,
    ).stdout.split()
    for gone in ("docker-shim.sh", "docker-group.sh"):
        assert not [one for one in tracked if one.endswith(gone)], (
            f"{gone} is back; the credential belongs to the image, not to "
            f"whoever remembers to ask for it"
        )

    # `sg` and `newgrp` in any spelling, with no proximity requirement - the
    # previous pattern demanded `docker` within 80 characters and missed six of
    # seven evasions, including the file it had just deleted.
    reexec = re.compile(r"(?:^|[\s'\"/=(])(?:sg|newgrp)\s")
    offenders = []
    for name in tracked:
        path = REPO_ROOT / name
        if not path.is_file() or path.suffix in {".png", ".ico", ".woff2", ".pdf"}:
            continue
        if path.suffix in {".md", ".txt"} or name.startswith("app/"):
            continue  # prose does not execute, and `_evidence` records recipes
        if name == "tests/docker/test_socket_group.py":
            continue  # this file's own description of what it refuses
        if reexec.search(executable(path)):
            offenders.append(name)
    assert not offenders, (
        f"these re-exec through `sg`/`newgrp` to acquire a group the image "
        f"already grants: {offenders}"
    )
