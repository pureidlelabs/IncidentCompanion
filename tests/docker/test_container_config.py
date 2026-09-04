# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only

"""The container's configuration, checked without a container.

None of these needs Docker, so they run in the ordinary suite. The tier that
*does* need Docker is `test_container_runtime.py`.

`test_the_node_stack_publishes_one_loopback_port_and_no_more` and
`test_the_server_binds_every_interface` are load-bearing only as a pair: narrow
the bind and the container is unreachable through its own published port, widen
the publish and the app is on the LAN. Neither file reads as wrong alone.
"""
from __future__ import annotations

import functools
import ipaddress
import os
import subprocess
import re
import tempfile
from pathlib import Path

import pytest
import yaml
from tests._must_run import declined
from tests._repo import REPO_ROOT

REPO_ROOT = REPO_ROOT
#: **The Node stack, and it is the only one now.** `compose.yaml`, the root
#: `Dockerfile` and `start-docker.sh` were deleted on 2026-08-15: the Python
#: app is kept as a behaviour reference, not as something that ships, and
#: `docker/app/Dockerfile` is the image an analyst runs.
COMPOSE = REPO_ROOT / "compose.yaml"
DOCKERFILE = REPO_ROOT / "docker" / "app" / "Dockerfile"
MAIN_TS = REPO_ROOT / "server" / "src" / "main.ts"

# `test_every_published_port_is_loopback_only` was here and is retired with the
# Python compose file. The property is not: it moved to
# `test_the_node_stack_publishes_one_loopback_port_and_no_more` below, which
# also holds the half this could not -- that Postgres and Redis publish nothing
# at all now that the server runs in the network beside them.


#: The Node stack, and `docker compose up --build` against it is the whole
#: procedure -- there is no launcher script.
NODE_STACK = REPO_ROOT / "compose.yaml"


def test_the_node_stack_publishes_one_loopback_port_and_no_more():
    """Exactly one service publishes, and every mapping it makes is loopback.

    So Postgres and Redis publish nothing: inside the compose network they are
    `postgres:5432` and `redis:6379`. `compose.dev.yaml` is out of scope, since
    the dev loop runs the suite and the server from the host.
    """
    spec = yaml.safe_load(NODE_STACK.read_text(encoding="utf-8"))
    services = spec.get("services", {})
    assert services, "compose.yaml declares no services"

    publishing = {
        name: [str(entry) for entry in service.get("ports", [])]
        for name, service in services.items()
        if service.get("ports")
    }

    # **The edge is whichever service publishes, not a name written here.**
    # This asserted `app` until nginx took over TLS termination, and the
    # assertion it made -- everything other than `app` publishes nothing --
    # failed the correct topology while passing the wrong one. Counting is the
    # property: one door to the host, wherever it happens to live.
    assert len(publishing) == 1, (
        f"{len(publishing)} services publish to the host ({sorted(publishing)}), "
        f"so there is more than one door into the stack and only one of them "
        f"is the one anybody reviewed")

    [(edge, published)] = publishing.items()
    assert published, f"the {edge} service publishes no port, so nothing is reachable"

    for entry in published:
        parts = entry.split(":")
        assert len(parts) >= 3, (
            f"the port mapping {entry!r} names no host address, so Docker "
            "publishes it on every interface")
        # The host side is an interpolation, so the address is what is
        # asserted and the port is left alone.
        address = ipaddress.ip_address(parts[0])
        assert address.is_loopback, (
            f"the port mapping {entry!r} publishes on {address}, which is "
            f"not loopback -- {edge} would be reachable from the network")

    # The app must not be the door once something fronts it: a published app
    # port is a plaintext listener on the host, which is the one thing this
    # whole move must not produce.
    assert "app" not in publishing or edge == "app", (
        "the app service publishes to the host alongside the edge, so the "
        "proxy can be bypassed")


def test_the_server_binds_every_interface():
    """The server must bind 0.0.0.0, or the loopback publish reaches nothing.

    A published port forwards into the container's *own* network namespace, so
    binding the container's loopback leaves the app dead from the host rather
    than hardened against the LAN.

    Asserted against `main.ts`, which passes the address to `listen` directly;
    the image sets no variable for it.
    """
    assert re.search(r"listen\(\s*env\.PORT\s*,\s*'0\.0\.0\.0'\s*\)",
                     MAIN_TS.read_text(encoding="utf-8")), (
        "the server does not bind 0.0.0.0, so the loopback-published port "
        "forwards into a container that is not listening on it")


def test_the_container_command_is_exec_form():
    """`CMD ["node", ...]`, never `CMD node ...`.

    Shell form puts /bin/sh at PID 1 and it does not forward SIGTERM, so every
    `docker stop` kills the process without Nest's shutdown hooks running -- and
    those are what close the database pool. Every stopped container would leave
    its connections to be reaped by Postgres instead.

    Asserted on the file because the behaviour needs a running daemon to observe.
    """
    cmd_lines = [
        line for line in DOCKERFILE.read_text(encoding="utf-8").splitlines()
        if line.strip().startswith("CMD")
    ]
    assert cmd_lines, "the Dockerfile declares no CMD"
    for line in cmd_lines:
        payload = line.strip()[len("CMD"):].strip()
        assert payload.startswith("["), (
            f"{line.strip()!r} is shell form, so /bin/sh is PID 1 and "
            "SIGTERM never reaches node")


def test_every_volume_is_docker_managed():
    """Every volume is Docker-managed, and no service pins `user:`.

    The two are one property. A managed volume is created owned by the image's
    user, so a service pinning a uid cannot write its own mount point and the
    entrypoint dies before node starts.

    → `_retired/nginx-owns-tls-and-the-launcher-went` for what dropping the
    bind mounts cost.
    """
    spec = yaml.safe_load(NODE_STACK.read_text(encoding="utf-8"))
    volumes = spec.get("volumes", {})
    assert volumes, "compose.yaml declares no volumes, so nothing persists"

    bound = {
        name: (definition or {}).get("driver_opts", {})
        for name, definition in volumes.items()
        if (definition or {}).get("driver_opts", {}).get("o") == "bind"
    }
    assert not bound, (
        f"{sorted(bound)} are bind-backed. A bind needs a host path, which needs "
        f"a launcher to resolve and create it and a uid to own it -- the three "
        f"things removing them was for"
    )

    # The mirror of it: no service may pin a uid either, or the image's
    # ownership of a fresh volume stops being the thing that makes it writable.
    pinned = [
        name for name, service in spec.get("services", {}).items() if service.get("user")
    ]
    assert not pinned, (
        f"{pinned} pin `user:`, so a managed volume owned by the image's uid is "
        f"unwritable to them and the entrypoint dies before node starts"
    )


@pytest.mark.skipif(os.name != "posix", reason="runs the shell launcher")
def test_every_variable_the_stack_requires_is_one_secrets_sh_writes():
    """A required variable nothing writes is a stack that cannot come up.

    The credentials are deliberately required rather than defaulted -- a
    defaulted password is one that ships. What has to hold is that the one-time
    step covers every name compose refuses to start without, and that the
    refusal says which step. `config` resolves interpolations and fails on a
    missing `${VAR:?}` exactly as `up` would, without starting anything.
    """
    compose = NODE_STACK.read_text(encoding="utf-8")
    required = set(re.findall(r"\$\{(IC_[A-Z_]+):\?", compose))
    assert required, "the stack requires no credential, so one is defaulted somewhere"

    secrets = (REPO_ROOT / "docker" / "secrets.sh").read_text(encoding="utf-8")
    # Every name it writes, however it holds them -- a `NAMES=` list today, an
    # assignment each tomorrow. Matching one spelling is how this passes while
    # naming nothing.
    written = set(re.findall(r"IC_[A-Z_]+", secrets))
    assert not required - written, (
        f"compose refuses to start without {sorted(required - written)}, and "
        f"docker/secrets.sh writes none of them")


def test_the_stack_names_the_one_time_step_when_a_credential_is_missing():
    """Otherwise the first run fails on an interpolation error and nothing says why.

    **`--env-file /dev/null`, or this asks about the machine rather than the
    stack.** Compose reads `.env` from the project directory whatever the
    environment holds, so on any tree where `docker/secrets.sh` has been run --
    which the README tells the operator to do -- the config resolves and the
    assertion below reads as a defaulted credential.
    """
    named = set(re.findall(r"\$\{([A-Za-z_][A-Za-z0-9_]*)", NODE_STACK.read_text(encoding="utf-8")))
    env = {k: v for k, v in os.environ.items() if k not in named}
    try:
        result = subprocess.run(
            ["docker", "compose", "--env-file", os.devnull, "-f", str(NODE_STACK), "config"],
            capture_output=True, text=True, env=env,
        )
    except FileNotFoundError:
        declined("The missing-credential message", "no docker on PATH")
    if result.returncode != 0 and "docker" in result.stderr and "not found" in result.stderr:
        declined("The missing-credential message", "no docker on PATH")
    assert result.returncode != 0, "the stack resolved with no credentials, so one is defaulted"
    assert "secrets.sh" in result.stderr, (
        f"a missing credential does not name the step that writes it:\n{result.stderr}")


def test_the_published_port_is_the_one_the_base_url_names():
    """The edge's published host port must appear in `AUTH_BASE_URL`.

    Asserted as a *relationship* rather than against a literal: both sides
    interpolate `IC_STACK_PORT`, so they move together whatever it is set to.
    A port-less base URL passes only at 443, which is what a browser omits.

    → `container/the-published-port-is-part-of-the-origin`.
    """
    spec = yaml.safe_load(NODE_STACK.read_text(encoding="utf-8"))

    base = str(spec["services"]["app"]["environment"]["AUTH_BASE_URL"])
    # Read rather than indexed: `spec["services"]["nginx"]["ports"]` raises
    # `KeyError: 'ports'` on a stack where something else became the door, and
    # a KeyError is not a guard -- it reads as a broken test.
    edge = spec["services"].get("nginx") or {}
    published = [str(p) for p in edge.get("ports") or []]
    assert published, (
        "the nginx service publishes nothing, so no Origin the base URL names "
        "is reachable -- something else is the door, or there is no door")

    # **`rsplit`, because the host side contains colons of its own.** Splitting
    # forward gave `'${IC_STACK_PORT'` -- a fragment that appears in the base
    # URL too, so this assertion passed on the exact defect it was written for.
    # Measured: the published default at 8443 with the base URL left at 443
    # kept all 43 deployment tests green.
    # `container:host:target` or `host:target` -- the middle field either way,
    # and read positionally so a mapping with no host binding fails the
    # assertion below rather than raising IndexError out of the split.
    fields = published[0].split(":")
    host_side = fields[-2] if len(fields) >= 2 else ""
    assert host_side in base, (
        f"the edge publishes host port {host_side!r} and AUTH_BASE_URL is "
        f"{base!r}. A browser's Origin carries the published port, so an origin "
        f"the base URL cannot derive is refused with 403 INVALID_ORIGIN -- "
        f"after the first session expires, not at first run"
    )


# `test_the_launcher_publishes_the_port_compose_defaults_to` was here, comparing
# `start-node.sh`'s port default against compose's. The launcher was deleted on
# 2026-08-16, so there is one default and nothing to compare it with -- and the
# property it protected, that the published port and `AUTH_BASE_URL` cannot
# disagree, is held by `test_the_published_port_is_the_one_the_base_url_names`
# above, which asserts them as a relationship rather than as two constants.


NGINX_CONF = REPO_ROOT / "docker" / "nginx" / "default.conf"
NGINX_PROXY = REPO_ROOT / "docker" / "nginx" / "ic-proxy.inc"


def test_the_edge_overwrites_the_client_ip_header_for_every_location():
    """The header the app trusts must be set here, on every path.

    `auth.config.ts` trusts `x-real-ip` in production, and the only thing
    stopping a caller forging it is nginx overwriting it. No running suite can
    see that, so it is asserted against the config text.

    Four vertices, because any one alone is satisfied by the wrong file: the
    `X-Real-IP` overwrite, `Host` forwarded with its port, a `default_server`
    that closes on an unknown hostname, and every `location` including the
    proxy fragment.
    """
    proxy = NGINX_PROXY.read_text(encoding="utf-8")
    assert re.search(r"^\s*proxy_set_header\s+X-Real-IP\s+\$remote_addr\s*;",
                     proxy, re.MULTILINE), (
        "the edge does not overwrite X-Real-IP from the peer address, so the "
        "header auth.config.ts trusts is whatever the caller sent")

    # **`$http_host`, and the difference from `$host` is the port.** `$host`
    # drops it, and `LiveGateway.sameOrigin` compares the forwarded `Host`
    # against the browser's `Origin`, which carries it -- so on any published
    # port but 443 every WebSocket upgrade was refused `403 cross-origin` and
    # presence, claims, the change feed and the report CRDT were dead while
    # every HTTP route answered perfectly. No tier constrained this vertex.
    assert re.search(r"^\s*proxy_set_header\s+Host\s+\$http_host\s*;",
                     proxy, re.MULTILINE), (
        "the edge does not forward the original Host with its port, so a "
        "stack published on any port but 443 refuses every WebSocket")

    conf = NGINX_CONF.read_text(encoding="utf-8")

    # **The catch-all is what `$http_host` leans on, and nothing asserted it.**
    # Measured: deleting the `default_server` block left 24 deployment tests
    # green, and a rebuilt edge then answered `Host: evil.test` with 200 and
    # forwarded that hostname verbatim to the app. It is the protection that
    # replaced the loopback `Host` guard when the certificate left the server.
    assert re.search(r"listen\s+443\s+ssl\s+default_server\s*;", conf), (
        "no default_server block, so an unrecognised hostname is served by "
        "whichever server block happens to be first")
    assert re.search(r"return\s+444\s*;", conf), (
        "the default_server does not close the connection on an unknown "
        "hostname -- a rebinding probe learns what is behind it")

    locations = re.findall(r"^\s*location\s+([^\s{]+)\s*\{(.*?)^\s*\}",
                           conf, re.MULTILINE | re.DOTALL)
    assert locations, "no location blocks found, so nothing proxies"
    missing = [name for name, body in locations if "ic-proxy.inc" not in body]
    assert not missing, (
        f"location(s) {missing} proxy without including ic-proxy.inc, so a "
        f"request through them carries the caller's own X-Real-IP")


def test_the_only_published_port_belongs_to_the_tls_edge():
    """The door to the host must be the proxy, not the plaintext app.

    **The sibling guard is one vertex short and this is that vertex.** It counts
    publishers and requires loopback, so a compose file where `app` is the sole
    publisher and nginx publishes nothing passed -- measured, 20 green -- which
    is exactly the plaintext-listener-on-the-host this whole move exists to
    prevent.
    """
    spec = yaml.safe_load(NODE_STACK.read_text(encoding="utf-8"))
    publishing = {
        name: [str(entry) for entry in service.get("ports", [])]
        for name, service in spec.get("services", {}).items()
        if service.get("ports")
    }
    # A real message rather than `ValueError: too many values to unpack`, which
    # reads as a broken test instead of a refused configuration.
    assert len(publishing) == 1, (
        f"{sorted(publishing)} publish to the host; only the TLS edge may")
    [(edge, published)] = publishing.items()

    # **Named, not inferred from the port.** Asserting only that the target is
    # 443 let `app` publish `127.0.0.1:443:443` with nginx publishing nothing --
    # the plaintext server exposed to the host, which is exactly what this move
    # exists to prevent, and both publish guards passed it.
    assert edge == "nginx", (
        f"the host's only door is {edge!r}, not the TLS edge -- a plaintext "
        f"server published to the host is what this whole move removes")

    targets = {entry.split(":")[-1] for entry in published}
    assert targets == {"443"}, (
        f"the published service {edge!r} forwards to container port(s) "
        f"{sorted(targets)}; the host's only door must reach 443, or what is "
        f"exposed is not the TLS edge")


@pytest.mark.parametrize("path", [COMPOSE, DOCKERFILE])
def test_the_container_files_exist(path: Path):
    """Named so a rename fails loudly here rather than as an empty parse."""
    assert path.is_file(), f"{path.name} is missing"


def test_the_workspace_is_a_volume_the_container_clones_itself():
    """`workspaceMount` must be declared, and it must be a volume.

    Omitting `workspaceMount` does not mean "no mount" — the devcontainers CLI
    falls back to binding whatever folder was opened at `/workspaces/<name>`,
    which is the exact bind mount this setup exists to remove. Measured with
    `devcontainer read-configuration`: an omitted `workspaceMount` next to a
    set `workspaceFolder` still resolves to a host bind. So this asserts the
    *positive* — a declared volume — rather than the absence of the old
    spelling, which a fallback bind would also pass.
    → `container/the-workspace-is-cloned-not-mounted`,
    `_retired/a-worktree-gets-none-of-the-dev-containers-volumes`.
    """
    import json

    devcontainer_text = (REPO_ROOT / ".devcontainer" / "devcontainer.json").read_text(
        encoding="utf-8")
    stripped = re.sub(r"^\s*//.*$", "", devcontainer_text, flags=re.MULTILINE)
    config = json.loads(stripped)

    mount = config.get("workspaceMount")
    assert mount, (
        "devcontainer.json declares no workspaceMount -- omitting it falls "
        "back to a bind mount of whatever folder was opened, not to no mount")
    fields = dict(part.split("=", 1) for part in mount.split(",") if "=" in part)
    assert fields.get("type") == "volume", (
        f"workspaceMount is {mount!r}, not a volume -- the host folder is "
        "still being bound into the container")
    assert config.get("workspaceFolder") == fields.get("target"), (
        "workspaceFolder does not match workspaceMount's target")
    # Documented as supported here, not substituted in practice.
    assert "${devcontainerId}" not in mount, (
        f"workspaceMount is {mount!r} -- ${{devcontainerId}} reaches Docker "
        "unsubstituted and the container never starts")


def test_the_clone_script_is_baked_into_the_image_not_read_from_the_workspace():
    """`onCreateCommand` must be an absolute path.

    It runs before the workspace volume has anything in it -- that is the
    problem it exists to solve -- so a relative path resolved against
    `workspaceFolder` would name a file that does not exist yet. `Dockerfile`
    is what has to put it there instead.
    """
    devcontainer = (REPO_ROOT / ".devcontainer" / "devcontainer.json").read_text(
        encoding="utf-8")
    dockerfile = (REPO_ROOT / ".devcontainer" / "Dockerfile").read_text(
        encoding="utf-8")
    clone_script = REPO_ROOT / ".devcontainer" / "clone-workspace.sh"

    assert clone_script.is_file(), "clone-workspace.sh is missing"
    match = re.search(r'"onCreateCommand":\s*"([^"]+)"', devcontainer)
    assert match, "devcontainer.json declares no onCreateCommand"
    command = match.group(1)
    assert command.startswith("/"), (
        f"onCreateCommand {command!r} is a relative path -- it would resolve "
        "against the empty workspace volume rather than the image")
    assert command in dockerfile, (
        f"Dockerfile never COPYs anything to {command!r}, so onCreateCommand "
        "names a path the image does not have")


DEV_DOCKERFILE = REPO_ROOT / ".devcontainer" / "Dockerfile"
DEVCONTAINER = REPO_ROOT / ".devcontainer" / "devcontainer.json"


def test_the_project_memory_is_bound_into_the_container_at_the_key_it_reads():
    """The memory bind lands on the key a session in the container computes."""
    import json

    stripped = re.sub(r"^\s*//.*$", "", DEVCONTAINER.read_text(encoding="utf-8"),
                      flags=re.MULTILINE)
    config = json.loads(stripped)
    home = "/home/vscode"
    key = config["workspaceFolder"].replace("/", "-").replace(".", "-")
    want_target = f"{home}/.claude/projects/{key}/memory"

    # `readonly` is a bare word rather than a `key=value`, so the raw mount
    # string is kept beside the parsed one.
    raw = [mount for mount in config.get("mounts", [])
           if re.search(r"target=[^,]*/memory(,|$)", mount)]
    assert len(raw) == 1, f"expected one memory mount, found {raw}"
    raw = raw[0]
    memory = dict(part.split("=", 1) for part in raw.split(",") if "=" in part)

    assert memory["target"] == want_target, (
        f"the memory bind targets {memory['target']!r}, but a session opened at "
        f"{config['workspaceFolder']} reads {want_target!r}")
    assert not re.search(r"(^|,)(readonly|ro)(,|$)", raw), (
        "the memory bind is read-only -- nothing written in the container "
        "reaches the Mac, and Claude Code writes memories rather than only "
        "reading them")
    # **A fixed name, resolved by `host-init.sh`.** `devcontainer.json` cannot
    # transform a string, so it cannot spell this machine's project key -- and a
    # hardcoded one would bind somebody else's memory, `mkdir -p` creating it
    # rather than failing. The link is what carries the key.
    assert memory["source"] == "${localEnv:HOME}/.claude/ic-project-memory", (
        f"the memory bind source is {memory['source']!r} -- it must be the fixed "
        f"name host-init.sh points at this checkout's project key")


def test_the_dev_container_installs_node_itself_rather_than_by_feature():
    """Node comes from the image at `ui/.nvmrc`'s major, and not from the feature."""
    devcontainer = DEVCONTAINER.read_text(encoding="utf-8")
    dockerfile = DEV_DOCKERFILE.read_text(encoding="utf-8")

    assert "devcontainers/features/node" not in devcontainer, (
        "devcontainer.json declares the node feature -- its installer pipes an "
        "unauthenticated raw.githubusercontent.com response into bash, so a 429 "
        "from that host is executed as a shell script")

    # **`mise.toml` pins it, not the Dockerfile.** Every version the container
    # carries moved there so Renovate's `mise` manager raises the bump as a pull
    # request; a `ARG NODE_VERSION` is what let Node sit still.
    mise = (REPO_ROOT / ".devcontainer" / "mise.toml").read_text(encoding="utf-8")
    match = re.search(r'^node\s*=\s*"(\d+)\.\d+\.\d+"', mise, flags=re.MULTILINE)
    assert match, (
        ".devcontainer/mise.toml pins no node -- with the feature gone and no "
        "Dockerfile ARG, nothing else puts node on PATH")
    assert "mise" in dockerfile, (
        "the Dockerfile does not install mise, so mise.toml pins nothing")
    floor = (REPO_ROOT / "ui" / ".nvmrc").read_text(encoding="utf-8").strip()
    assert match.group(1) == floor, (
        f"the dev container pins Node {match.group(1)}.x against ui/.nvmrc's "
        f"{floor}")


def test_no_download_in_the_dev_container_reaches_a_shell_or_ignores_an_http_error():
    """No `curl … | bash` in the image, and every `curl` carries `-f`."""
    dockerfile = DEV_DOCKERFILE.read_text(encoding="utf-8")

    piped = [line.strip() for line in dockerfile.splitlines()
             if "curl" in line and re.search(r"\|\s*(ba)?sh\b", line)]
    assert not piped, (
        f"the dev container pipes a download into a shell: {piped} -- an error "
        "page then runs as a build step")

    for line in dockerfile.splitlines():
        for flags in re.findall(r"curl\s+(-\S+)", line):
            assert "f" in flags, (
                f"curl without -f in the dev container: {line.strip()!r} -- it "
                "exits 0 on a 4xx and writes the error body where the payload "
                "was expected")


def test_no_dependency_may_run_an_install_script_undeclared():
    """Every package npm flags must carry an explicit allow/deny, and scarf a deny.

    `@scarf/scarf` is why this is asserted: its `report.js` POSTs the install to
    scarf.sh, and `scarfSettings` in `server/package.json` is the package asking
    itself to behave, where a deny here means the script never runs. `npm
    install-scripts approve --all` would undo it silently, and that command is
    what npm's own warning invites.

    **Cannot see a dependency that gains an install script later** — the
    enumeration is fixed here. `npm install-scripts ls` is the command for
    that, and the build warning already prints it.
    """
    import json

    # **The root, since the move to workspaces, and only the root.** npm reads
    # `allowScripts` from the directory it installs in; one install at the root
    # serves both packages, so a copy in `server/` or `ui/` is read by nobody
    # and reads as covered. That move dropped all three on the first root
    # install, which npm reported as a warning rather than an error.
    manifest = json.loads((REPO_ROOT / "package.json").read_text(encoding="utf-8"))
    declared = manifest.get("allowScripts", {})
    missing = {"esbuild", "@swc/core", "@scarf/scarf"} - set(declared)
    assert not missing, (
        f"the root package.json declares no allowScripts decision for "
        f"{sorted(missing)} -- npm warns on every install and runs nothing")

    for project in ("server", "ui"):
        package = json.loads(
            (REPO_ROOT / project / "package.json").read_text(encoding="utf-8"))
        assert "allowScripts" not in package, (
            f"{project}/package.json still declares allowScripts, which a "
            f"workspace install does not read -- two homes for one decision, "
            f"and the one that is read is the other one")

    assert declared["@scarf/scarf"] is False, (
        "@scarf/scarf is allowed to run its postinstall -- that is a telemetry "
        "POST to scarf.sh from a project that makes no outbound request")


def test_the_image_builds_and_serves_the_react_ui():
    """The image builds ui/dist in its own stage, copies it, and names it.

    Four vertices, because the image serves no front end and says nothing about
    it whenever any one of them is missing: `ui/dist` is untracked, so an image
    that never builds it looks identical to one that did.

    **A node *stage* rather than a host-built bundle**: running the image must
    not require node on the host, and a stage cannot ship a stale bundle since
    it builds from the same context it copies.
    """
    dockerfile = DOCKERFILE.read_text(encoding="utf-8")
    assert re.search(r"^FROM node:\S+ AS ui-build\s*$", dockerfile,
                     re.MULTILINE), (
        "no node build stage -- the image cannot produce ui/dist and the "
        "React tier silently drops out of the supported launcher")
    assert "RUN npm ci" in dockerfile and "npm run --workspace ui build" in dockerfile, (
        "the ui-build stage does not build the bundle")
    assert re.search(r"^COPY --from=ui-build /repo/ui/dist \./ui\s*$",
                     dockerfile, re.MULTILINE), (
        "the runtime stage never copies the built bundle, so the server "
        "answers /api and nothing else")
    # **`UI_DIR`, and it is not optional in an image.** `bundlePath` falls back
    # to walking four levels up for `ui/dist`, which is a checkout's layout;
    # an image that does not set the variable serves no front end and says
    # nothing, because the bundle is cargo rather than a dependency.
    assert re.search(r"^ENV UI_DIR=/app/ui\s*$", dockerfile, re.MULTILINE), (
        "the bundle is in the image but UI_DIR is unset, so bundlePath looks "
        "for a checkout layout that is not there and the SPA never serves")


def test_the_ui_build_stage_copies_every_file_npm_ci_needs():
    """`ui/.npmrc` is load-bearing for `npm ci`, so the stage must copy it, first.

    Asserts both the copy and its position: a `COPY` after the `RUN npm ci` is
    too late to affect it.

    Skips when `ui/.npmrc` is gone rather than naming it unconditionally, so
    the test retires itself the day the eslint peer range is fixed upstream and
    the file is deleted.

    → `container/the-ui-build-stage-is-a-partial-checkout`.
    """
    if not (REPO_ROOT / "ui" / ".npmrc").is_file():
        pytest.skip("ui/.npmrc is gone, so the stage no longer needs it")

    dockerfile = DOCKERFILE.read_text(encoding="utf-8")
    stage = dockerfile.split("AS ui-build", 1)
    assert len(stage) == 2, "no ui-build stage to check"
    # Up to the next FROM: a COPY in a later stage does not help this npm ci.
    body = re.split(r"^FROM ", stage[1], flags=re.MULTILINE)[0]

    copy_line = next(
        (line for line in body.splitlines()
         if line.strip().startswith("COPY") and ".npmrc" in line), None)
    assert copy_line is not None, (
        "the ui-build stage never copies ui/.npmrc, so `npm ci` resolves peers "
        "without legacy-peer-deps and the image build fails on ERESOLVE")

    npmrc_at = body.index(copy_line)
    ci_match = re.search(r"^RUN npm ci", body, re.MULTILINE)
    assert ci_match and npmrc_at < ci_match.start(), (
        "ui/.npmrc is copied after `npm ci`, which is too late to affect it")


def test_the_ui_build_stage_provides_every_path_alias_tsconfig_resolves():
    """A `paths` alias escaping `ui/` must be copied, and be resolvable.

    Two assertions per escaping alias, because either alone fails identically:
    the stage copies the directory, and something makes `node_modules`
    resolvable from its root — node walks up from the *importing* file, so
    packages under `/ui` are not on the path for a file under `/server`.

    Derived from `paths` rather than naming `server/`, so a second alias out of
    `ui/` is covered. Skips when no alias escapes.

    → `container/the-ui-build-stage-is-a-partial-checkout`.
    """
    import json

    tsconfig = (REPO_ROOT / "ui" / "tsconfig.app.json").read_text(
        encoding="utf-8")
    # JSONC: strip // comments before parsing, which is what makes this
    # readable as data rather than matched as a substring.
    stripped = re.sub(r"^\s*//.*$", "", tsconfig, flags=re.MULTILINE)
    paths = json.loads(stripped)["compilerOptions"].get("paths", {})

    escaping = sorted({
        target for targets in paths.values() for target in targets
        if target.startswith("../")
    })
    if not escaping:
        pytest.skip("no alias leaves ui/, so the stage needs nothing extra")

    dockerfile = DOCKERFILE.read_text(encoding="utf-8")
    body = re.split(r"^FROM ", dockerfile.split("AS ui-build", 1)[1],
                    flags=re.MULTILINE)[0]

    for target in escaping:
        # "../server/src/domain/*" -> the directory the stage has to hold.
        needed = target[len("../"):].rstrip("/*")
        assert any(needed in line for line in body.splitlines()
                   if line.strip().startswith("COPY")), (
            f"tsconfig maps an alias to {target!r} but the ui-build stage "
            f"never copies {needed!r} -- every type from it resolves to "
            "nothing and `npm run build` fails on the shapes built from them")

        # Copying is half of it. Those files import `zod` and `yjs` by bare
        # name and node walks up from the *importing* file, so the copy has to
        # land **under the directory the install ran in**. The failure is
        # identical to not copying at all, which is why both halves are
        # asserted rather than one standing for the other.
        #
        # A workspace root is what satisfies it now. This used to demand
        # `ln -s /ui/node_modules /server/node_modules`, which put the copy at
        # an absolute path outside the install and linked a tree at it - and a
        # symlink npm installs through deletes what it points at.
        destination = next(
            line.split()[-1] for line in body.splitlines()
            if line.strip().startswith("COPY") and needed in line)
        assert not destination.startswith("/"), (
            f"{needed!r} is copied to {destination!r}, outside the directory "
            f"the install ran in -- node walks up from the importing file, so "
            f"its bare imports resolve to nothing and their types collapse")

    assert re.search(r"^RUN npm ci", body, re.MULTILINE), (
        "the ui-build stage installs nothing, so nothing the copied files "
        "import resolves at all")


def test_the_build_context_excludes_the_ui_working_files():
    """node_modules, dist and the dev root stay out of the build context.

    The context is sent to the daemon in full before anything runs; ui's
    node_modules alone is hundreds of MB. Excluding dist also means the stage
    can never accidentally COPY a stale host build over its own output.
    """
    # Entries, not substrings: a comment naming ui/dist satisfied the naive
    # `in` while the entry itself was deleted -- caught by this test's own
    # break-verify.
    entries = {
        line.strip()
        # **The repository root, not beside the Dockerfile.** The build context
        # is the root -- `docker/app/Dockerfile` reads `ui/` as well as `server/` --
        # and Docker takes `.dockerignore` from the context, so a copy next to
        # the Dockerfile would be read by nothing.
        for line in (REPO_ROOT / ".dockerignore")
        .read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    }
    for entry in ("ui/node_modules", "ui/dist", "ui/storybook-static",
                  "ui/.dev-root"):
        assert entry in entries, (
            f"{entry} is missing from .dockerignore -- it rides into every "
            "build context")


def test_the_two_stacks_pin_the_same_engines():
    """Dev and ship must pin the same Postgres and Redis image.

    Both compose files carry the reasoning for pinning to the minor. This is
    the other half -- pinned, and pinned to the same thing, so the suite
    exercises the engine that ships.
    """
    dev = yaml.safe_load((REPO_ROOT / "server" / "compose.dev.yaml").read_text(encoding="utf-8"))
    ship = yaml.safe_load(NODE_STACK.read_text(encoding="utf-8"))

    for service in ("postgres", "redis"):
        in_dev = dev["services"][service]["image"]
        in_ship = ship["services"][service]["image"]
        assert in_dev == in_ship, (
            f"the dev stack runs {service} on {in_dev!r} and the shipped stack "
            f"on {in_ship!r} -- the suite is not exercising the engine that "
            f"ships"
        )


def test_the_stack_hands_the_server_no_telemetry_switch():
    """No service may name `BETTER_AUTH_TELEMETRY` at all.

    Absent is the passing state, not `=0`: the environment beats
    `telemetry: {enabled: false}` in `auth.config.ts`, and the rule is that the
    stack does not participate rather than that it opts out.
    → `_evidence/better-auth-options-audit`.
    """
    stack = yaml.safe_load(NODE_STACK.read_text(encoding="utf-8"))

    for name, service in stack["services"].items():
        environment = service.get("environment") or {}
        keys = environment.keys() if isinstance(environment, dict) else environment
        offending = [k for k in keys if "BETTER_AUTH_TELEMETRY" in str(k)]
        assert not offending, (
            f"service {name!r} passes {offending!r} -- the environment wins over "
            f"`telemetry: {{ enabled: false }}`, so this decides it"
        )


def test_the_stack_seeds_as_a_one_shot_before_the_server_starts():
    """Seeding is a one-shot, and every edge of the chain is asserted.

    Each fails differently: no service and nothing seeds; the wrong image and it
    runs the TypeScript build instead of `dist`; the wrong order and the server
    serves an unseeded database while the one-shot is still writing. The order
    is roles, migrate, seed, app -- and roles waits on `service_healthy`, the
    rest on `service_completed_successfully`.

    Also asserts the Postgres healthcheck's `-h`, in both compose files, and
    `restart: no` on each one-shot.
    → `container/compose-wait-blocks-on-one-shots-and-healthchecks`.
    """
    stack = yaml.safe_load(NODE_STACK.read_text(encoding="utf-8"))
    seed = stack.get("services", {}).get("seed")
    assert seed, (
        "compose.yaml declares no seed one-shot, so a fresh install gets "
        "no case templates, no report layouts and no language pack"
    )
    assert "dist/src/seed.js" in " ".join(seed.get("command", [])), (
        f"the seed service does not run the compiled entry: {seed.get('command')}"
    )
    assert seed.get("image") == stack["services"]["app"]["image"], (
        "the seed one-shot runs a different image from the server, so it can "
        "seed with code the server does not have"
    )

    # **The order is compose's now, not the launcher's.** This read
    # `start-node.sh` for `run --rm migrate` before `run --rm seed` before the
    # final `up`, which was five shell steps reimplementing `depends_on`. The
    # property is unchanged -- schema, then seed, then serve -- and it is
    # asserted where it is expressed, so `docker compose up` on its own is
    # covered too. That was not true before: a bare `up` gave an app that
    # exited with `password authentication failed for user "ic_app"`, because
    # only the launcher ever applied the roles.
    def waits_on(service: str) -> dict:
        return stack["services"][service].get("depends_on") or {}

    def completed(service: str, upstream: str) -> bool:
        want = waits_on(service).get(upstream) or {}
        return want.get("condition") == "service_completed_successfully"

    # **The edge that actually breaks, and it was the unasserted one.** Deleting
    # `roles`' whole `depends_on` block -- so it starts before Postgres exists --
    # left 31 compose tests green. A guard over four vertices, mutated at three.
    assert (waits_on("roles").get("postgres") or {}).get("condition") == "service_healthy", (
        "the roles one-shot does not wait for Postgres to be healthy, so it "
        "connects to a database that may not be accepting yet and takes the "
        "whole chain down with it")

    assert completed("migrate", "roles"), (
        "the schema push does not wait for the roles, so it runs as a role "
        "that may not exist yet")
    assert completed("seed", "migrate"), (
        "seeding does not wait for the schema, so it writes into tables that "
        "may not be there")
    assert completed("app", "seed"), (
        "the server does not wait for the seed, so a fresh install serves a "
        "screen with no case templates and no language pack")

    # **The healthcheck's transport, which is the whole load-bearing surface of
    # this chain.** Without `-h`, `pg_isready` checks the unix socket while
    # every dependent connects over TCP -- and initdb's temporary server, which
    # runs with `listen_addresses=''`, answers the socket. Measured under a
    # 0.15-CPU limit: 2 cold starts in 5 failed with the socket check, 0 in 8
    # with the host flag. Stripping the flag left 55 tests green, which is why
    # this assertion exists: every Postgres compose example on the internet
    # shows the bare form, so tidying it back is the likely move.
    #
    # Both files, because `compose.dev.yaml` carries the same check and the
    # suite runs against it.
    for compose_file in (NODE_STACK, REPO_ROOT / "server" / "compose.dev.yaml"):
        spec_here = yaml.safe_load(compose_file.read_text(encoding="utf-8"))
        probe = " ".join(spec_here["services"]["postgres"]["healthcheck"]["test"])
        assert "-h " in probe, (
            f"{compose_file.name}'s Postgres healthcheck is {probe!r} -- with no "
            f"host flag it checks the unix socket, which initdb's temporary "
            f"server answers while TCP is still refused, so the chain starts "
            f"against a database that is not accepting")

    # A one-shot that restarts is not a one-shot: compose would run the seed
    # again every time it exits, and the demo reseed *deletes* first.
    for one_shot in ("roles", "migrate", "seed"):
        assert str(stack["services"][one_shot].get("restart", "no")) == "no", (
            f"{one_shot} is not pinned to `restart: no`, so compose may run it "
            f"again on exit")


def test_the_host_seed_copies_plugin_payloads_but_not_their_manifests():
    """`~/.claude/plugins` holds content *and* machine-local state.

    `cache` and `marketplaces` are machine-independent and may be copied;
    `plugins` itself may not, because the manifests beside it record the host's
    absolute paths.

    **Structural, because the failure is a call site rather than a value.** The
    copy succeeds either way; what makes it wrong is which names it is given.

    → `container/a-seeded-plugin-tree-loads-nothing-without-its-manifests`.
    """
    script = (REPO_ROOT / ".devcontainer" / "post-start.sh").read_text(encoding="utf-8")

    portable = re.search(r"^\s*for entry in ([^;]+); do", script, re.MULTILINE)
    assert portable, "post-start.sh no longer seeds the host config -- this test moved"
    assert "plugins" not in portable.group(1).split(), (
        f"post-start.sh seeds `plugins` as if it were portable content: "
        f"{portable.group(1).strip()!r}. That copies installed_plugins.json, "
        f"whose paths are the host's, and every plugin then resolves to nothing"
    )

    trees = re.search(r"^\s*for tree in ([^;]+); do", script, re.MULTILINE)
    assert trees, (
        "post-start.sh seeds no plugin payloads at all, so a fresh container "
        "re-downloads every plugin it already has on disk"
    )
    assert set(trees.group(1).split()) == {"cache", "marketplaces"}, (
        f"the plugin seed names {trees.group(1).strip()!r}; only the two "
        f"machine-independent directories may be copied"
    )


def test_the_npm_chown_reaches_the_directories_an_update_writes_to():
    """Chowning the package directory alone leaves the CLI unable to update.

    An update stages a temporary directory into `lib/node_modules` and relinks
    `bin/claude`, and the CLI's own check tests the prefix root on top of that.
    Chowning `@anthropic-ai` satisfies none of the three.

    **The prefix root is the entry that looks redundant and is not.** npm
    succeeds without it; the CLI goes on printing the banner, which is how a
    fix verified with `npm install -g` reads as complete while the warning
    stays up.

    **Widening to `-R` is the other failure**, and it is what somebody reaches
    for when the narrow chown is found to be insufficient: it hands this user
    every other global package and Node's own binaries.

    → `container/the-npm-prefix-is-owned-by-the-node-tarballs-build-uid`.
    """
    script = (REPO_ROOT / ".devcontainer" / "post-start.sh").read_text(encoding="utf-8")

    loop = re.search(
        r"^for d in ([^;]*NPM_PREFIX[^;]*); do\n(.*?)^done", script,
        re.MULTILINE | re.DOTALL)
    assert loop, (
        "post-start.sh chowns nothing under the npm prefix itself, so an "
        "update cannot stage into lib/node_modules or relink bin/claude, and "
        "the CLI prints `no write permission to npm prefix` on every start")

    targets = {m or "." for m in
               re.findall(r'"\$NPM_PREFIX(?:/([^"]+))?"', loop.group(1))}
    assert targets == {".", "lib/node_modules", "bin"}, (
        f"the prefix chown covers {sorted(targets)}; it needs the prefix root "
        f"(what the CLI's own writability check tests), lib/node_modules (npm "
        f"stages a temporary directory beside the package) and bin (npm "
        f"relinks the executable)")

    assert not re.search(r"chown\s+-R", loop.group(2)), (
        "the prefix chown is recursive, which hands this user every other "
        "global package and every binary in the Node tarball -- the "
        "directories alone are what an update writes to")


def test_no_role_carries_a_password_in_the_tree():
    """A password may be spelled in neither file, and psql syntax in only one.

    Each password was the role's own name -- `ic_app:ic_app` -- in a tracked
    file, so every reader of this repository held the credentials of every
    install that ran it unchanged. The least-privilege work around them is
    careful and real: `ic_app` is `NOSUPERUSER NOBYPASSRLS` with no DDL, and
    `ic_seed` exists so the request-serving role cannot delete every case. None
    of it survives a password anybody can read.

    **The second assertion is what the split bought.** `roles.sql` is run by
    psql, by `stack.mjs`, and by the test harness through a driver that has no
    psql variables -- and a caller forgetting to substitute died in vitest's
    global setup reading as a broken database. Two source-text guards were
    written to hold that and both were measured inert, because "every caller
    remembers" is a discipline over an open set of callers. A file that may not
    contain the syntax at all is one grep, and it is decided here.
    """
    roles = (REPO_ROOT / "docker" / "db" / "roles.sql").read_text(encoding="utf-8")
    passwords = (REPO_ROOT / "docker" / "db" / "role-passwords.sql").read_text(encoding="utf-8")

    for name, sql in (("roles.sql", roles), ("role-passwords.sql", passwords)):
        literal = re.findall(r"PASSWORD\s+'([^']*)'", sql)
        assert not literal, (
            f"{name} spells {literal!r} -- a password in a tracked file is a "
            f"password every reader has. Take it from a psql variable."
        )

    # **Comments stripped first**, so the file may explain the syntax it must
    # not contain -- the first version of this check read the whole file, and
    # `roles.sql`'s own header had to break a sentence to avoid quoting itself.
    statements = "\n".join(
        line for line in roles.splitlines() if not line.lstrip().startswith("--")
    )
    # `:'x'` is one of five spellings and the only one the first version caught.
    # Measured through `pg`: `:x`, `:"x"`, `\set` and `\gexec` each fail with
    # the same `42601` and each passed that check.
    psql_only = re.search(r"(?m)^\s*\\|:[\"']?[A-Za-z_]", statements)
    assert not psql_only, (
        f"roles.sql carries psql syntax ({psql_only.group(0)!r}), and it is "
        f"read by a driver that substitutes nothing -- every run without a "
        f"reachable Postgres then dies in vitest global setup on a bare "
        f"`syntax error`. Passwords and anything else psql-only go in "
        f"role-passwords.sql, which only psql runs."
    )
    assert "PASSWORD :'" in passwords, (
        "role-passwords.sql sets no password at all now, which leaves roles "
        "nothing can authenticate as"
    )


def test_every_executor_of_the_roles_runs_both_halves():
    """The split has five vertices, and a suite that holds two is not holding it.

    `roles.sql` and `role-passwords.sql` are one definition in two files
    because only psql can run the second. Every consumer that *can* run both
    must, or a shipped install creates three roles with no password and the app
    cannot authenticate -- loudly, at the first `up`, which is why this is
    coverage rather than a defect. Measured: dropping the second `-f` and the
    second `COPY` together left the whole Python tier at 341 passed.
    """
    spec = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))
    command = [str(arg) for arg in spec["services"]["roles"]["command"]]
    assert "/roles.sql" in command and "/role-passwords.sql" in command, (
        f"the roles service runs {command!r} -- both halves or the passwords "
        f"are never set"
    )
    assert command.index("/roles.sql") < command.index("/role-passwords.sql"), (
        "role-passwords.sql runs first, and `ALTER ROLE` on a role that does "
        "not exist yet fails the one-shot under ON_ERROR_STOP"
    )

    dockerfile = (REPO_ROOT / "docker" / "db" / "Dockerfile").read_text(encoding="utf-8")
    for name in ("roles.sql", "role-passwords.sql"):
        assert f"docker/db/{name}" in dockerfile, (
            f"the image does not carry {name}, so the roles service cannot -f it"
        )

    stack = (REPO_ROOT / "server" / "scripts" / "stack.mjs").read_text(encoding="utf-8")
    for name in ("roles.sql", "role-passwords.sql"):
        assert f"'{name}'" in stack, (
            f"stack.mjs --roles does not name {name}, so a worktree cluster "
            f"gets the other half only"
        )


def test_no_credential_falls_back_to_a_shipped_default():
    """A `:-default` on a password is the shipped credential, one layer along.

    `POSTGRES_PASSWORD: ${IC_STACK_PG_PASSWORD:-incidentcompanion}` reads as
    configurable and behaves as a constant, because nothing makes an operator
    set it. `:?` refuses to start instead, naming the script that writes one.
    """
    stack = NODE_STACK.read_text(encoding="utf-8")

    defaulted = re.findall(r"\$\{(IC_[A-Z_]*(?:PASSWORD|SECRET)[A-Z_]*):-([^}]*)\}", stack)
    assert not defaulted, (
        f"these credentials fall back to a value in the tree: {defaulted!r}. "
        f"Use `${{NAME:?...}}` so a missing one stops the stack."
    )

    required = re.findall(r"\$\{(IC_[A-Z_]*(?:PASSWORD|SECRET)[A-Z_]*):\?", stack)
    assert required, "no credential is required at all -- this test is watching nothing"


def test_redis_asks_for_a_password():
    """It holds session tokens, and the key *is* the bearer token.

    Read straight off the running store before this: `auth:<token>` mapping to
    a value repeating the same token beside the full user row. Anything that
    could open a TCP connection could read one and replay it as a cookie. The
    publish is confined to the compose network, which is real containment and
    is the whole of what stood between that and a session.
    """
    stack = yaml.safe_load(NODE_STACK.read_text(encoding="utf-8"))
    redis = stack["services"]["redis"]

    command = " ".join(redis.get("command") or [])
    assert "--requirepass" in command, (
        "redis takes no password, so anything on the compose network reads a "
        "live session token"
    )

    for name in ("app", "seed"):
        url = stack["services"][name]["environment"]["REDIS_URL"]
        assert "@redis:" in url, (
            f"{name} connects to redis with no credentials in {url!r}, which "
            f"cannot work once redis asks for one"
        )


#: Keys that belong to a healthcheck and mean nothing anywhere else. A block
#: indented one level short puts them in `environment:`, where compose accepts
#: them, injects them into the container, and runs the check on its own
#: defaults instead.
HEALTHCHECK_TIMINGS = frozenset({"interval", "timeout", "retries",
                                 "start_period", "start_interval"})


def test_no_healthcheck_timing_is_lost_in_an_environment_block():
    """**Found in `redis`, where it cost a 30-second wait on every cold start.**

    `depends_on: redis: condition: service_healthy` gates both `app` and
    `seed`, so the first probe landing at compose's default 30s interval rather
    than the declared 2s delays every start of the shipped stack - and three
    variables named `interval`, `timeout` and `retries` were handed to redis.

    Nothing could see it: `docker compose config` accepts the file, and the
    tier asserted on Postgres's `-h` flag and on every `depends_on` edge but
    never on the *shape* of a healthcheck. `postgres` and `app` carrying the
    four keys correctly was the tell.
    """
    for stack in (COMPOSE, REPO_ROOT / "server" / "compose.dev.yaml"):
        services = yaml.safe_load(stack.read_text(encoding="utf-8"))["services"]
        for name, service in services.items():
            environment = service.get("environment")
            if isinstance(environment, dict):
                stray = HEALTHCHECK_TIMINGS & set(environment)
                assert not stray, (
                    f"{stack.name}: {name} carries {sorted(stray)} under "
                    f"`environment:`, so its healthcheck runs on compose's "
                    f"defaults and the container is handed three junk variables"
                )
            check = service.get("healthcheck")
            if check:
                assert "interval" in check and "retries" in check, (
                    f"{stack.name}: {name} declares a healthcheck with no "
                    f"{sorted({'interval', 'retries'} - set(check))} -- "
                    f"compose's defaults are 30s and 3, which is what a block "
                    f"indented one level short falls back to"
                )


def test_the_devcontainer_clones_the_repository_it_lives_in():
    """A clone URL is a claim about which repository this is, and it can rot.

    **Measured 2026-08-27**, the day the development history moved to
    `IncidentCompanion-private` and `IncidentCompanion` became the publication
    target: `clone-workspace.sh` still named the second, on branch `dev`. That
    repository holds one commit on `main` and no `dev` at all, so the container
    would have come up around a coming-soon README -- or failed to clone, which
    is the better of the two outcomes.

    Asserted against `origin` rather than against a literal, because the pair
    is the property: the container is meant to be this checkout, somewhere
    else.
    """
    remote = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        cwd=REPO_ROOT, capture_output=True, text=True, check=True,
    ).stdout.strip()

    script = (REPO_ROOT / ".devcontainer" / "clone-workspace.sh").read_text(
        encoding="utf-8")
    declared = re.search(r'^REPO_URL="([^"]+)"', script, re.MULTILINE)
    assert declared, "clone-workspace.sh declares no REPO_URL"

    # **Compared as host and path, not as a string.** The same repository is
    # `git@github.com:owner/repo.git` over SSH and `https://github.com/owner/
    # repo` over HTTPS, and `actions/checkout` sets the second -- so a literal
    # comparison passes on a laptop cloned over SSH and fails in CI, which is
    # an environment difference reported as a defect.
    def repo_of(url: str) -> str:
        without_scheme = re.sub(r"^[a-z+]+://", "", url)
        without_user = re.sub(r"^[^/@]+@", "", without_scheme)
        return re.sub(r"\.git$", "", without_user.replace(":", "/", 1)).rstrip("/").lower()

    assert repo_of(declared.group(1)) == repo_of(remote), (
        f"the devcontainer clones {declared.group(1)} while origin is {remote} "
        f"-- the container would be built around a different repository"
    )


def test_the_memory_bind_and_host_init_still_agree_on_one_name():
    """A bind mount to a path that is not there mounts an empty directory.

    Docker creates a missing bind source rather than refusing, so the memory
    store arrives empty and reads as a project that has never been worked on.
    Nothing reports it.

    **Both files or neither.** `devcontainer.json` cannot transform a string, so
    it binds one fixed name and `host-init.sh` points that name at the key this
    checkout computes. A rename reaching one file and not the other is the empty
    bind above, with an extra step.
    """
    mount_line = next(
        line for line in
        (REPO_ROOT / ".devcontainer" / "devcontainer.json")
        .read_text(encoding="utf-8").splitlines()
        if "ic-project-memory" in line and "target=" in line
    )
    init = (REPO_ROOT / ".devcontainer" / "host-init.sh").read_text(encoding="utf-8")

    link = re.search(r'ln -sfn\s+\S+\s+"\$HOME/\.claude/(ic-project-memory)"', init)
    assert link, (
        "host-init.sh creates no ic-project-memory link, so devcontainer.json "
        "binds a name nothing resolves")
    assert link.group(1) in mount_line, (
        f"host-init.sh links {link.group(1)} and devcontainer.json mounts "
        f"something else: {mount_line.strip()}")

    # The key is derived from the checkout, never written down: a literal here
    # would be one machine's path, and `mkdir -p` would create somebody else's.
    assert 'PROJECT_KEY="$(printf' in init and "tr '/' '-'" in init, (
        "host-init.sh no longer derives the project key from the checkout path")
    assert not re.search(r"/Users/|/home/\w+/\.claude/projects/-", init), (
        "host-init.sh hardcodes a machine's path")


TLS_ENTRYPOINT = REPO_ROOT / "docker" / "nginx" / "tls-entrypoint.sh"


def _require_openssl():
    try:
        subprocess.run(["openssl", "version"], capture_output=True, check=True)
    except FileNotFoundError:
        pytest.skip("no openssl on PATH")


def _run_tls_entrypoint(cert_dir: Path, *, name: str | None = None):
    env = dict(os.environ, IC_TLS_DIR=str(cert_dir))
    if name is not None:
        env["IC_TLS_NAME"] = name
    return subprocess.run(["sh", str(TLS_ENTRYPOINT)], env=env,
                          capture_output=True, text=True)


def _fault(result: subprocess.CompletedProcess, cert_dir: Path) -> str:
    """`stderr`, with the certificate directory's own path removed.

    `tmp_path` embeds the test's own name, so a keyword assertion could match
    the path rather than the message it names.
    """
    return result.stderr.lower().replace(str(cert_dir).lower(), "")


@functools.lru_cache(maxsize=1)
def _openssl_dates_the_pair() -> bool:
    """Whether this openssl takes `-not_before`, asked by trying it.

    **Probed rather than matched on a message.** The guard here read
    `"not_before" in result.stderr`, and the refusal openssl actually gives is
    `req: Use -help for summary.` -- so it never fired, and three cases failed
    on the runner while passing on a developer's machine. `-not_before`
    arrived in OpenSSL 3.5; ubuntu-24.04 ships 3.0.
    """
    with tempfile.TemporaryDirectory() as tmp:
        probe = subprocess.run(
            ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
             "-keyout", str(Path(tmp) / "k.pem"), "-out", str(Path(tmp) / "c.pem"),
             "-subj", "/CN=probe",
             "-not_before", "20200101000000Z", "-not_after", "20200102000000Z"],
            capture_output=True, text=True)
    return probe.returncode == 0


@functools.lru_cache(maxsize=1)
def _openssl_refuses_a_wrong_name() -> bool:
    """Whether `x509 -checkhost` reports a mismatch in its exit status.

    The entrypoint's name check is `openssl x509 -noout -checkhost`, and an
    openssl that prints the mismatch without failing makes that check refuse
    nothing. **Measured in the image the product ships** -- `nginx:1.31-alpine`
    carries OpenSSL 3.5.8, where a mismatch exits 1 -- so this is a fact about
    the host running the suite, never about what is deployed.
    """
    with tempfile.TemporaryDirectory() as tmp:
        cert = Path(tmp) / "c.pem"
        minted = subprocess.run(
            ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
             "-keyout", str(Path(tmp) / "k.pem"), "-out", str(cert),
             "-subj", "/CN=elsewhere.example",
             "-addext", "subjectAltName=DNS:elsewhere.example", "-days", "5"],
            capture_output=True, text=True)
        if minted.returncode != 0:
            return False
        checked = subprocess.run(
            ["openssl", "x509", "-in", str(cert), "-noout", "-checkhost", "localhost"],
            capture_output=True, text=True)
    return checked.returncode != 0


def _require_name_checking_openssl() -> None:
    """Declines where the host's openssl cannot express the refusal under test.

    Stated rather than silent: the case would otherwise assert that the
    entrypoint refused, get a pass from an openssl that refuses nothing, and
    report success.
    """
    if not _openssl_refuses_a_wrong_name():
        pytest.skip(
            "this openssl does not fail on a -checkhost mismatch, so the "
            "entrypoint's name check cannot be observed here; the shipped "
            "image carries OpenSSL 3.5.8, where it does")


def _mint_pair(cert_dir: Path, *, cn: str = "localhost",
               sans: str = "DNS:localhost,IP:127.0.0.1",
               not_before: str | None = None, not_after: str | None = None):
    """A cert/key pair with openssl, standing in for an operator's own."""
    if not_before and not_after and not _openssl_dates_the_pair():
        pytest.skip("this openssl does not support -not_before (it arrived in 3.5)")
    args = ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
            "-keyout", str(cert_dir / "key.pem"), "-out", str(cert_dir / "cert.pem"),
            "-subj", f"/CN={cn}", "-addext", f"subjectAltName={sans}"]
    if not_before and not_after:
        args += ["-not_before", not_before, "-not_after", not_after]
    else:
        args += ["-days", "825"]
    result = subprocess.run(args, capture_output=True, text=True)
    assert result.returncode == 0, f"failed to mint a test pair: {result.stderr}"


def test_the_first_start_with_nothing_supplied_still_mints(tmp_path: Path):
    _require_openssl()
    result = _run_tls_entrypoint(tmp_path)
    assert result.returncode == 0, result.stderr
    assert (tmp_path / "cert.pem").is_file()
    assert (tmp_path / "key.pem").is_file()


def test_a_sound_supplied_pair_is_left_byte_identical(tmp_path: Path):
    _require_openssl()
    _mint_pair(tmp_path)
    before_cert = (tmp_path / "cert.pem").read_bytes()
    before_key = (tmp_path / "key.pem").read_bytes()

    result = _run_tls_entrypoint(tmp_path)

    assert result.returncode == 0, result.stderr
    assert (tmp_path / "cert.pem").read_bytes() == before_cert
    assert (tmp_path / "key.pem").read_bytes() == before_key


def test_a_malformed_supplied_certificate_is_named_and_not_minted_over(tmp_path: Path):
    _require_openssl()
    (tmp_path / "cert.pem").write_text("not a certificate")
    (tmp_path / "key.pem").write_text("not a key")
    before_cert = (tmp_path / "cert.pem").read_bytes()
    before_key = (tmp_path / "key.pem").read_bytes()

    result = _run_tls_entrypoint(tmp_path)

    assert result.returncode != 0, "a malformed pair must not be accepted"
    assert "malformed" in _fault(result, tmp_path), result.stderr
    assert (tmp_path / "cert.pem").read_bytes() == before_cert, (
        "a malformed certificate was minted over rather than refused")
    assert (tmp_path / "key.pem").read_bytes() == before_key, (
        "a malformed key was minted over rather than refused")


def test_an_expired_supplied_certificate_is_named_and_not_minted_over(tmp_path: Path):
    _require_openssl()
    _mint_pair(tmp_path, not_before="20200101000000Z", not_after="20200102000000Z")
    before_cert = (tmp_path / "cert.pem").read_bytes()
    before_key = (tmp_path / "key.pem").read_bytes()

    result = _run_tls_entrypoint(tmp_path)

    assert result.returncode != 0, "an expired certificate must not be accepted"
    assert "expired" in _fault(result, tmp_path), result.stderr
    assert (tmp_path / "cert.pem").read_bytes() == before_cert, (
        "an expired certificate was minted over rather than refused")
    assert (tmp_path / "key.pem").read_bytes() == before_key, (
        "the key beside an expired certificate was minted over rather than refused")


def test_a_certificate_and_key_that_do_not_match_is_named_and_not_minted_over(tmp_path: Path):
    _require_openssl()
    _mint_pair(tmp_path)
    # A key from an unrelated pair, dropped in beside the real certificate.
    other = tmp_path / "other"
    other.mkdir()
    _mint_pair(other)
    before_cert = (tmp_path / "cert.pem").read_bytes()
    (tmp_path / "key.pem").write_bytes((other / "key.pem").read_bytes())
    before_key = (tmp_path / "key.pem").read_bytes()

    result = _run_tls_entrypoint(tmp_path)

    assert result.returncode != 0, "a mismatched key must not be accepted"
    assert "match" in _fault(result, tmp_path), result.stderr
    assert (tmp_path / "cert.pem").read_bytes() == before_cert, (
        "a certificate with a mismatched key was minted over rather than refused")
    assert (tmp_path / "key.pem").read_bytes() == before_key, (
        "a mismatched key was minted over rather than refused")


def test_a_certificate_not_covering_the_reached_name_is_named_and_not_minted_over(
        tmp_path: Path):
    _require_openssl()
    _require_name_checking_openssl()
    _mint_pair(tmp_path, cn="elsewhere.example", sans="DNS:elsewhere.example")
    before_cert = (tmp_path / "cert.pem").read_bytes()
    before_key = (tmp_path / "key.pem").read_bytes()

    result = _run_tls_entrypoint(tmp_path)

    assert result.returncode != 0, "a certificate for another name must not be accepted"
    assert "localhost" in _fault(result, tmp_path), result.stderr
    assert (tmp_path / "cert.pem").read_bytes() == before_cert, (
        "a certificate for the wrong name was minted over rather than refused")
    assert (tmp_path / "key.pem").read_bytes() == before_key, (
        "the key beside a wrong-name certificate was minted over rather than refused")


def test_the_operator_supplied_name_is_honoured(tmp_path: Path):
    _require_openssl()
    _require_name_checking_openssl()
    _mint_pair(tmp_path, cn="soc.example.org", sans="DNS:soc.example.org")
    before_cert = (tmp_path / "cert.pem").read_bytes()
    before_key = (tmp_path / "key.pem").read_bytes()

    # Against the default name this certificate fails -- proving the check is
    # live before proving the override satisfies it.
    default_result = _run_tls_entrypoint(tmp_path)
    assert default_result.returncode != 0

    result = _run_tls_entrypoint(tmp_path, name="soc.example.org")

    assert result.returncode == 0, result.stderr
    assert (tmp_path / "cert.pem").read_bytes() == before_cert
    assert (tmp_path / "key.pem").read_bytes() == before_key


def test_half_a_pair_is_refused_rather_than_completed(tmp_path: Path):
    _require_openssl()
    _mint_pair(tmp_path)
    (tmp_path / "key.pem").unlink()
    before_cert = (tmp_path / "cert.pem").read_bytes()

    result = _run_tls_entrypoint(tmp_path)

    assert result.returncode != 0, "half a pair must not be completed"
    assert "one of" in _fault(result, tmp_path), result.stderr
    assert (tmp_path / "cert.pem").read_bytes() == before_cert, (
        "the supplied half of a pair was minted over rather than refused")
    assert not (tmp_path / "key.pem").is_file(), (
        "the missing half of a pair was minted rather than refusing outright")


def test_the_app_waits_for_the_ephemeral_store_to_be_reachable():
    """The install does not start while Redis is unreachable, and that is where it belongs.

    `state` requires that *being unable to reach [the ephemeral store] MUST stop
    the install serving*, and its scenario asks that an install whose ephemeral
    store cannot be reached *does not serve requests as though nothing were
    wrong*. The Nest process cannot answer that on its own -- it is the stack
    that is the install -- so the guarantee lives in `depends_on`, and a
    `service_healthy` condition is the whole of it.

    **The edge and the healthcheck are one guard, so both are asserted here.**
    `condition: service_healthy` against a service with no healthcheck is
    accepted by compose and waits for nothing, which is the shape that would
    leave this passing while the property was gone.

    What this does not cover, and #173's issue records it: `depends_on` gates
    startup only. A Redis that dies while the stack is up does not stop the
    running container, and nothing pulls an unhealthy app out of nginx's
    upstream.
    """
    stack = yaml.safe_load(NODE_STACK.read_text(encoding="utf-8"))

    waits = (stack["services"]["app"].get("depends_on") or {}).get("redis") or {}
    assert waits.get("condition") == "service_healthy", (
        "the app does not wait for redis to be healthy, so an install whose ephemeral "
        "store is unreachable starts anyway and serves as though nothing were wrong -- "
        "sessions, presence and rate-limit counters all answering from a store that "
        f"is not there. Found: {waits!r}"
    )

    check = stack["services"]["redis"].get("healthcheck") or {}
    assert check.get("test"), (
        "redis declares no healthcheck, so `condition: service_healthy` waits for "
        "nothing and the edge above is decoration"
    )


def test_no_listener_serves_the_install_unprotected():
    """There is no plaintext door, and none can be added by accident.

    `deployment` puts it absolutely: *everything reaching the install MUST
    arrive over a protected connection. There MUST be no setting, flag,
    environment variable or test path that serves it unprotected.*

    The existing case asserts the TLS listener is **present**. This asserts no
    other kind is, which is the half that fails open: adding `listen 80;`
    beside it leaves every current assertion true, and the install answers
    plaintext on a port the compose file need never publish for a browser on
    the machine to reach it through a redirect somebody adds later.

    Read off every `listen` in the served config rather than a named port, so
    a listener on 8080 or on a socket is caught by the same rule.
    """
    conf = (REPO_ROOT / "docker" / "nginx" / "default.conf").read_text(encoding="utf-8")

    listeners = [
        line.strip()
        for line in conf.splitlines()
        if re.match(r"^\s*listen\s", line) and not line.strip().startswith("#")
    ]

    assert listeners, "the served config declares no listener, so this asserts nothing"

    unprotected = [one for one in listeners if "ssl" not in one]
    assert not unprotected, (
        "these listeners serve without TLS, so the install has a door that answers "
        f"plaintext -- which the specification says must not exist: {unprotected}"
    )


def test_every_role_is_created_only_where_it_is_absent():
    """A second start creates nothing that is already there.

    `deployment` asks that starting an install that has run before recreates
    nothing and loses nothing. For the roles one-shot that is a property of the
    SQL: Postgres has no `CREATE ROLE IF NOT EXISTS`, so each creation sits
    inside a guard that looks the role up first -- and a creation added without
    one **fails the second start**, which turns *one command* into one command
    that works once.

    Read as a pairing rather than by counting: every `CREATE ROLE` must be
    preceded by a guard naming the same role, so a fourth role added without
    one is caught by the rule that catches the first three.

    The rest of the requirement is held elsewhere and is not repeated here: a
    supplied certificate surviving a restart is
    `test_a_sound_supplied_pair_is_left_byte_identical`, and an analyst's own
    case surviving a reseed is `demos/seeder.service.test.ts`'s *leaves a real
    case alone*.
    """
    sql = (REPO_ROOT / "docker" / "db" / "roles.sql").read_text(encoding="utf-8")

    created = re.findall(r"^\s*CREATE ROLE\s+(\w+)", sql, re.MULTILINE)
    assert created, "roles.sql creates no role, so this asserts nothing"

    guarded = set(re.findall(r"IF NOT EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = '(\w+)'\)", sql))

    unguarded = [role for role in created if role not in guarded]
    assert not unguarded, (
        "these roles are created without first checking whether they exist, so the "
        f"second start of an install fails on a role it made the first time: {unguarded}"
    )


#: What `deployment` says must outlive the install, and the volume each is on.
#:
#: Named rather than derived: nothing in the compose file says which volume is
#: "the certificate", so the mapping is a claim this test makes and fails on
#: when it moves. The alternative -- deriving it from the mount paths -- would
#: be the constant checked against itself.
MUST_SURVIVE = {
    "ic-db": "the store's data",
    "ic-tls": "the certificate",
    "ic-install": "the install's own identity",
    "ic-evidence": "evidence",
}


def test_what_must_survive_is_on_a_named_volume_and_is_mounted():
    """Everything that must outlive the install has somewhere to outlive it.

    *Everything that must outlive the install's own lifetime MUST be held where
    it survives being stopped, rebuilt and upgraded: the store's data, the
    certificate, the install's own identity, and evidence.*

    A volume declared and mounted by nothing is the failure this catches: the
    compose file looks right, the data is written into the container's own
    layer, and it is gone on the next `docker compose up --build`.
    """
    spec = yaml.safe_load(NODE_STACK.read_text(encoding="utf-8"))
    declared = set((spec.get("volumes") or {}).keys())

    missing = [name for name in MUST_SURVIVE if name not in declared]
    assert not missing, (
        "these have nowhere to survive a rebuild: "
        + ", ".join(f"{name} ({MUST_SURVIVE[name]})" for name in missing)
    )

    mounted = {
        str(entry).split(":", 1)[0]
        for service in spec["services"].values()
        for entry in service.get("volumes") or []
    }
    unmounted = [name for name in MUST_SURVIVE if name not in mounted]
    assert not unmounted, (
        "these volumes are declared and mounted by no service, so what they hold is "
        "written into a container layer and lost on the next rebuild: "
        + ", ".join(f"{name} ({MUST_SURVIVE[name]})" for name in unmounted)
    )


def test_the_ephemeral_store_is_given_nowhere_to_survive():
    """*Nothing else MUST be*, and Redis is the one that would be tempting.

    `state` splits durable from ephemeral by what their loss means, and the
    ephemeral half is defined by being losable: *losing all of it MUST cost
    analysts their sign-in and nothing else*. A volume on Redis quietly makes
    it durable -- sessions, presence and rate-limit counters surviving a
    rebuild -- and then the separation is a claim nothing holds.

    It is also the change somebody makes for a good reason: a restart signing
    everyone out looks like a defect until you know it is the design.
    """
    spec = yaml.safe_load(NODE_STACK.read_text(encoding="utf-8"))

    held = spec["services"]["redis"].get("volumes") or []
    assert not held, (
        f"redis is given somewhere to persist ({held}), so what the specification calls "
        "ephemeral outlives the install and the two kinds of state stop being separated "
        "by anything"
    )


def test_a_psql_one_shot_stops_on_the_first_error():
    """A preparation step that fails cannot report success.

    `deployment` asks that where *preparation cannot complete*, the application
    *does not serve* and *what failed is apparent*. The first half is the
    `service_completed_successfully` chain, already asserted. This is what
    makes that chain mean anything: psql exits 0 after printing an error unless
    it is told otherwise, so a roles run that failed every statement satisfies
    "completed successfully" and the application starts against a database with
    none of its roles.

    The compose file records the trap in a comment -- *without it psql prints
    the error, exits 0, and a failed roles run reports success* -- and nothing
    failed if the flag were dropped.

    Every psql command is swept rather than the one service, so a second SQL
    one-shot is held to the same rule the day it is added.
    """
    spec = yaml.safe_load(NODE_STACK.read_text(encoding="utf-8"))

    using_psql = {
        name: [str(part) for part in service.get("command") or []]
        for name, service in spec["services"].items()
        if str((service.get("command") or [""])[0]) == "psql"
    }

    assert using_psql, "no service runs psql, so this rule covers nothing"

    unstopped = [
        name
        for name, command in using_psql.items()
        if "ON_ERROR_STOP=1" not in command
    ]
    assert not unstopped, (
        f"{unstopped} run psql without ON_ERROR_STOP=1, so a statement that fails is "
        "printed and the one-shot still exits 0 -- which satisfies "
        "`service_completed_successfully` and lets the application serve against a "
        "database its preparation never finished"
    )
