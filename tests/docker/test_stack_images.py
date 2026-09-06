# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only

"""The images the stack builds, and what may not be in them.

Read out of `docker/app/Dockerfile` and `compose.yaml`, so every property here
is about what ships rather than about how it is started. Needs no daemon.

**Startup *order* is not here**: it belongs to the `depends_on` chain and is
asserted in `test_container_config.py`.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml
from tests._repo import REPO_ROOT


def _service(name: str) -> dict:
    """One service out of `compose.yaml`, parsed rather than sliced.

    **A text slice between two service keys is satisfiable by a neighbour.**
    Adding a `worker:` service between `app:` and `migrate:` puts that service's
    body inside the slice, so a logging guard passes while the *app* has no
    `logging:` block at all, and a role guard reports `app` holding what `worker`
    holds. A YAML file has one parser, and `tests/docker/test_container_config.py`
    already imports it against this same file.
    """
    spec = yaml.safe_load(STACK.read_text(encoding="utf-8"))
    services = spec.get("services", {})
    assert name in services, f"compose.yaml declares no {name!r} service"
    return services[name] or {}

ROOT = REPO_ROOT
DOCKERFILE = ROOT / "docker" / "app" / "Dockerfile"
STACK = ROOT / "compose.yaml"


def _text() -> str:
    return SCRIPT.read_text(encoding="utf-8")


def _dockerfile() -> str:
    return DOCKERFILE.read_text(encoding="utf-8")


@pytest.mark.parametrize("path", ["dev-node.sh", "docker/app/Dockerfile"])
def test_no_tool_is_resolved_from_the_registry(path: str) -> None:
    """`npx` reaches the network; a pinned tool must come from `node_modules`.

    The version it fetched was not the version the lockfile pins, so this is a
    wrong-tool bug and not only a missing-network one: `npx --no-install` is
    `--yes false` rather than "stay offline", so npm still resolved the `latest`
    dist-tag (**0.31.10**, against the pinned **1.0.0-rc.4**) and cancelled.

    **The Dockerfile is here too.** That is where the build tools live now, so
    it is where the same line would next be typed.
    """
    offenders = [
        line
        for line in (ROOT / path).read_text(encoding="utf-8").splitlines()
        if re.search(r"(^|\s)npx(\s|$)", line) and not line.lstrip().startswith("#")
    ]
    assert not offenders, (
        f"{path} calls npx, which resolves from the registry when node_modules "
        f"is empty and ignores the pinned version: {offenders}"
    )


# --- What moved onto the image ---------------------------------------------


def _stages() -> dict[str, str]:
    """The Dockerfile split by `FROM`, keyed on stage name, **comments dropped**.

    **Prose is not an instruction, and leaving it in made two checks answer
    about the wrong thing.** The comment explaining why `--omit=peer` is needed
    contains the words "npm installs it", which the `npm install` ban matched --
    reporting that `server-build` resolves dependencies without the lockfile, in
    a stage whose only install is an `npm ci`. A comment naming a flag would
    equally have satisfied a check looking for it.
    """
    stages: dict[str, str] = {}
    name = None
    for line in _dockerfile().splitlines():
        match = re.match(r"\s*FROM\s+\S+\s+AS\s+(\S+)", line)
        if match:
            name = match.group(1)
            stages[name] = ""
        elif name is not None and not line.lstrip().startswith("#"):
            stages[name] += line + "\n"
    return stages


def test_the_node_floor_matches_what_the_packages_declare() -> None:
    """One floor, checked against `engines` rather than typed twice.

    **The version that matters is the one the image is built `FROM`**, not the
    host's node: nothing runs on the host, and the image's is the *only* node
    that ships. A bump to 27 in
    `package.json` otherwise leaves the image on 26 and the build fails inside
    `tsc` with a syntax error in a dependency.
    """
    declared = set()
    for package in ("server/package.json", "ui/package.json"):
        engines = json.loads((ROOT / package).read_text(encoding="utf-8"))["engines"]
        declared.add(int(re.search(r"(\d+)", engines["node"]).group(1)))
    assert len(declared) == 1, f"the two packages declare different floors: {declared}"

    pinned = {int(m) for m in re.findall(r"^FROM node:(\d+)", _dockerfile(), re.MULTILINE)}
    assert pinned, "docker/app/Dockerfile builds FROM no pinned node image"
    assert pinned == declared, (
        f"the image builds on node {sorted(pinned)} and package.json requires "
        f"{sorted(declared)}"
    )


def test_every_build_stage_installs_before_it_builds() -> None:
    """`npm ci` precedes `npm run` in each stage that runs a build.

    **This was `install_if_stale` in the launcher**, and the failure it guarded
    is unchanged: a stage that builds before it installs dies on a missing
    binary. Per stage rather than over the file, because Docker stages do not
    share a filesystem and an install in one buys nothing in another.
    """
    built = {
        name: body
        for name, body in _stages().items()
        if re.search(r"^\s*RUN npm run", body, re.MULTILINE)
    }
    assert built, "no stage runs a build -- the Dockerfile's shape changed"

    for name, body in built.items():
        lines = [line for line in body.splitlines() if not line.lstrip().startswith("#")]
        installs = [n for n, line in enumerate(lines) if re.search(r"npm ci", line)]
        builds = [n for n, line in enumerate(lines) if re.search(r"npm run", line)]
        assert installs, f"stage {name} runs a build with no install before it"
        assert min(installs) < min(builds), (
            f"stage {name} builds at line {min(builds)} and installs at "
            f"{min(installs)}, so it reaches a missing binary first"
        )
        assert "npm install" not in body, (
            f"stage {name} uses `npm install`, so the lockfile stops deciding "
            f"and the image gets whatever resolves that day"
        )


def test_the_build_stages_keep_the_dev_dependencies() -> None:
    """`NODE_ENV=production` makes npm's `omit` default to `dev`.

    Measured against this repo's own `server/`: `NODE_ENV=production npm ci
    --dry-run` says **removed 418 packages** -- `typescript`, `@nestjs/cli` and
    `drizzle-kit` among them -- where `--include=dev` says `up to date`. Every
    tool the build runs next is a devDependency.

    **The runtime stage is exempt and must be**: it is the one that should have
    none of them, and `--omit=dev` is how it says so.
    """
    for name, body in _stages().items():
        if not re.search(r"^\s*RUN npm run", body, re.MULTILINE):
            continue
        for line in body.splitlines():
            if "npm ci" not in line or line.lstrip().startswith("#"):
                continue
            assert "--include=dev" in line, (
                f"stage {name} installs without --include=dev, so a "
                f"NODE_ENV=production anywhere above it drops every build tool "
                f"and the build dies on a missing tsc: {line.strip()}"
            )


def test_the_runtime_carries_no_schema_tool() -> None:
    """`drizzle-kit` rewrites schemas and does not belong in the image serving
    the network.

    **`--omit=dev` does not keep it out, and this test asserted only that flag
    for one round while the image carried 96MB of drizzle-kit.** `better-auth`
    declares it `peerOptional`, so npm installs it as a *production* peer no
    matter how this package declares it -- `npm why drizzle-kit` names the path.
    Measured 2026-08-15 inside the built image: drizzle-kit 96MB,
    @electric-sql 26MB, typescript 24MB, in a tree installed `--omit=dev`.

    So the peer flag is the load-bearing one. The dev flag stays because
    dropping it would bring back the other 418.

    **This still reads the Dockerfile rather than the image**, which is the gap
    it cannot close: only `INCIDENTCOMPANION_CONTAINER_TESTS=1` builds one, and
    a flag test cannot see a package arriving through a fourth route. What it
    does catch is the edit that removes the flag -- which is exactly how the
    96MB got there.
    """
    stages = _stages()
    runtime_deps = stages.get("runtime-deps")
    assert runtime_deps, "the Dockerfile has no runtime-deps stage"
    install = [line for line in runtime_deps.splitlines() if "npm ci" in line]
    assert install, "the runtime-deps stage installs nothing"
    assert any("--omit=dev" in line for line in install), (
        f"the runtime tree is installed with devDependencies, which is the "
        f"other 418 packages: {install}"
    )

    # **The flag does not do it, so the removal is asserted instead.**
    # drizzle-kit is a `peerOptional` of better-auth, which makes it reachable
    # from a production dependency: `--omit=dev` leaves it and `--omit=peer`
    # leaves it. Measured 2026-08-15 inside the built image -- 96MB of it,
    # present under both flags.
    assert "rm -rf node_modules/drizzle-kit" in runtime_deps, (
        "drizzle-kit is not removed from the runtime tree, so a tool that "
        "rewrites schemas ships in the image that faces the network. No npm "
        "flag excludes it: it is an optional peer of better-auth"
    )

    # **The obvious third flag, and it breaks the server at boot.** Tried
    # 2026-08-15: `@node-rs/argon2` ships its native binding as a per-platform
    # *optional* dependency, so `--omit=optional` removes
    # `@node-rs/argon2-linux-arm64-gnu` and the process dies on `Cannot find
    # module` before it binds. It saves ~30MB and costs password hashing, so
    # there is no degraded mode to notice it in.
    assert not any("--omit=optional" in line for line in install), (
        "the runtime tree omits optional dependencies, which removes the "
        "native argon2 binding and the server exits on startup"
    )


def test_the_schema_push_runs_as_its_own_service() -> None:
    """The server connects as `ic_app`, which has no DDL at all.

    So a push cannot be something the app does on boot, and it must not be
    given a role that could -- which is the shortcut this asserts against. It is
    also what makes the step a Kubernetes Job rather than an init step in every
    replica.
    """
    migrate_env = _service("migrate").get("environment", {})
    assert any("ic_migrate" in str(v) for v in migrate_env.values()), (
        "the migrate service does not connect as the role that owns the schema"
    )

    app_env = _service("app").get("environment", {})
    assert not any("ic_migrate" in str(v) for v in app_env.values()), (
        "the app service is handed the migrate role, so the server can rewrite "
        "the schema it is meant to be scoped by"
    )


def test_the_app_service_keeps_the_stream_off_disk() -> None:
    """The setup token is printed on stdout, so the log driver is a decision.

    **Docker's default is `json-file`**, which writes every line of a
    container's stdout to `/var/lib/docker/containers/<id>/<id>-json.log`. That
    is the same exposure the launcher refuses, arriving from the daemon
    instead -- and containerising the server is what introduced it.

    Measured 2026-08-15 on Docker 29.4.0: with `driver: none` an attached
    `docker compose up` still prints the container's stdout, and `docker compose
    logs` refuses with *"configured logging driver does not support reading"*.
    So the terminal keeps everything and the disk gets nothing.
    """
    driver = _service("app").get("logging", {}).get("driver")
    assert driver, (
        "the app service declares no logging driver, so Docker's json-file "
        "default writes the setup token to disk on the first start of every "
        "install"
    )
    assert driver == "none", (
        f"the app service logs through {driver}, which persists the stream the "
        f"setup token is printed on"
    )
