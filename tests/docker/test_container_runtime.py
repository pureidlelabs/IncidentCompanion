# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only

"""The app container, actually running. Opt-in: `INCIDENTCOMPANION_CONTAINER_TESTS=1`.

Builds `docker/app/Dockerfile` through compose and exercises what only a
running container has: the entrypoint, signal handling, bind-mount ownership
and modes, and the published port. Opt-in because it builds an image.

Expectations are selected per host, from `HOST_PROFILES`. An unrecognised host
fails rather than skips.

"""
from __future__ import annotations

import contextlib
import json
import os
import platform
import pwd
import shutil
import subprocess
import sys
import tempfile
import time
import socket
import ssl
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from tests import posix_modes
from tests._must_run import declined
from tests._repo import REPO_ROOT

REPO_ROOT = REPO_ROOT
#: Host profile -> whether the app's own 0700/0600 modes are expected to be
#: visible on the *host* side of a bind mount, and whether that was measured
#: rather than assumed.
HOST_PROFILES = {
    "linux": {"host_sees_modes": True, "measured": True},
    "docker-desktop-macos": {"host_sees_modes": True, "measured": True},
    "colima-macos": {"host_sees_modes": True, "measured": True},
    "orbstack-macos": {"host_sees_modes": True, "measured": True},
    # Unmeasured: no WSL2 host available. False so a wrong assertion cannot
    # fire, and `measured` says why the skip is not a verdict -- the first
    # run on WSL2 should probe it and set this rather than trust it.
    "wsl2": {"host_sees_modes": False, "measured": False},
}


#: Daemon-name **prefix** -> the macOS profile it selects. A prefix because
#: `colima start --profile work` names the instance `colima-work`, which is
#: what `docker info` reports; an exact match fails a supported setup.
MACOS_RUNTIMES = {
    "colima": "colima-macos",
    "docker-desktop": "docker-desktop-macos",
    # The expected spelling, unconfirmed against a running daemon. A wrong one
    # makes `detect_host_profile` raise naming what the daemon said.
    "orbstack": "orbstack-macos",
}


def macos_profile_for(name: str) -> str | None:
    for prefix, profile in MACOS_RUNTIMES.items():
        if name.startswith(prefix):
            return profile
    return None


def detect_host_profile() -> str:
    """Which row of `HOST_PROFILES` applies, or raise.

    **On macOS the host OS does not identify the runtime, so the daemon is
    asked.** `platform.system()` says `Darwin` for Docker Desktop and for
    Colima alike; returning the Docker Desktop row for both is a mis-detection
    of exactly the kind the paragraph above rejects. `docker info` reports
    `Name` as `docker-desktop` or `colima` respectively.

    A native Linux host falls through rather than raising: `docker info` names
    the daemon host's *hostname* there, which matches no `MACOS_RUNTIMES`
    prefix.
    """
    system = platform.system()

    name = _docker_daemon_name()
    profile = macos_profile_for(name)
    if profile is not None:
        return profile

    if system == "Darwin":
        raise AssertionError(
            f"unrecognised macOS container runtime {name!r} -- add a "
            "prefix to MACOS_RUNTIMES and its row to HOST_PROFILES rather "
            "than letting this run with another runtime's expectations")
    if system == "Linux":
        version = Path("/proc/version")
        if version.exists() and "microsoft" in version.read_text().lower():
            return "wsl2"
        return "linux"
    raise AssertionError(
        f"unrecognised host {system!r} -- add a row to HOST_PROFILES rather "
        "than letting this run with another host's expectations")


def _docker_daemon_name() -> str:
    """The daemon's own name, or raise -- never a default.
    """
    result = subprocess.run(["docker", "info", "--format", "{{.Name}}"],
                            capture_output=True, text=True)
    if result.returncode != 0:
        raise AssertionError(
            "the daemon did not answer `docker info`, so the runtime is "
            f"unknown for want of an answer rather than unrecognised:\n"
            f"{result.stderr.strip()[-1000:]}")
    return result.stdout.strip()


def _docker_available() -> bool:
    if not shutil.which("docker"):
        return False
    result = subprocess.run(["docker", "info", "--format", "{{.ServerVersion}}"],
                            capture_output=True, text=True)
    return result.returncode == 0


pytestmark = pytest.mark.skipif(
    os.environ.get("INCIDENTCOMPANION_CONTAINER_TESTS", "") != "1",
    reason="opt-in: set INCIDENTCOMPANION_CONTAINER_TESTS=1 (builds an image)")


@pytest.fixture(autouse=True)
def _a_daemon_answers() -> None:
    """The daemon probe, as a decline; the opt-in above stays a skip. -> #1080"""
    if not _docker_available():
        declined("The container runtime tier", "no Docker daemon is reachable")

IMAGE = "incidentcompanion-node:local"


def test_the_host_profile_is_recognised_and_named(capsys):
    """Detection is asserted, not assumed, and the answer is printed.

    A mis-detected host runs another host's expectations and passes, so the
    one thing that cannot be left implicit is which row was chosen.
    """
    profile = detect_host_profile()
    assert profile in HOST_PROFILES
    with capsys.disabled():
        print(f"\n  container test tier: host profile = {profile}")


def test_an_unanswering_daemon_is_not_reported_as_an_unknown_runtime(
        monkeypatch):
    """The `raise` in `_docker_daemon_name`, which nothing else reaches.
    """
    def dead_daemon(*args, **kwargs):
        return subprocess.CompletedProcess(
            args, returncode=1, stdout="", stderr="Cannot connect to the "
            "Docker daemon at unix:///var/run/docker.sock.")

    monkeypatch.setattr(subprocess, "run", dead_daemon)
    with pytest.raises(AssertionError, match="did not answer"):
        _docker_daemon_name()


def test_the_daemons_host_decides_the_profile_not_the_clients_os(monkeypatch):
    """A Linux client talking to a macOS daemon gets the macOS row.

    **The profile describes the daemon's host, not the machine pytest runs
    on**, and those are not the same thing once the repository is opened in a
    dev container: the client is Debian, the daemon is OrbStack on the Mac, and
    bind sources resolve against macOS either way.

    Asking `platform.system()` first answers `linux`, which carries
    `{host_sees_modes: True, measured: True}` while `orbstack-macos`
    deliberately carries the opposite -- so the tier runs the inverted
    expectation and calls it measured. That is exactly the silent
    mis-selection this file's docstring is arranged against.
    """
    monkeypatch.setattr(platform, "system", lambda: "Linux")
    monkeypatch.setattr(
        sys.modules[__name__], "_docker_daemon_name", lambda: "orbstack")
    assert detect_host_profile() == "orbstack-macos"


def test_a_native_linux_daemon_still_selects_the_linux_row(monkeypatch):
    """The daemon-first rule must not swallow the ordinary Linux host.

    `docker info` reports `Name` as the daemon host's *hostname* there, which
    matches no `MACOS_RUNTIMES` prefix — so asking the daemon first has to fall
    through rather than raise. Without this the fix above turns every native
    Linux run into an unrecognised-runtime failure, which is a worse defect
    than the one it repairs.
    """
    monkeypatch.setattr(platform, "system", lambda: "Linux")
    monkeypatch.setattr(
        sys.modules[__name__], "_docker_daemon_name",
        lambda: "some-build-box")
    assert detect_host_profile() == "linux"


def test_a_bind_source_is_offered_inside_the_repository():
    """One candidate must sit under the repo, or the tier cannot run in here.

    Bind sources resolve against the *daemon's* filesystem. From inside the dev
    container that is macOS, while `tmp_path` (`/tmp/pytest-of-...`) and
    `$HOME` (`/home/vscode`) exist only in the container — so the daemon
    creates the missing source inside its VM rather than refusing, and the
    failure arrives three layers away as the app never starting.

    `devcontainer.json` mounts the workspace host-path-to-same-host-path
    precisely so one path is spelled identically on both sides. That makes the
    repository the only reliable candidate here, and it is why this is asserted
    on the *list* rather than left to whichever candidate happens to answer:
    with only `tmp_path` and `$HOME`, every test using the fixture errors with
    `the daemon can bind-mount neither`.

    Asserted structurally because the alternative needs a daemon whose host
    differs from the client's — which is the whole configuration this repairs,
    so a test that required it could never have caught its absence.
    """
    workspace = _workspace_root()
    roots = _bind_mount_roots()

    inside = [r for r in roots if r.parent == workspace or workspace in r.parents]
    assert inside, (
        f"no bind-source candidate is under {workspace} -- from inside the dev "
        "container every other candidate is container-only, and the daemon "
        "silently creates an unreachable source in its VM instead of failing")

    for root in inside:
        assert ".claude/worktrees" not in str(root), (
            f"the candidate {root} is inside a worktree, whose parent is a "
            "Docker volume with no macOS path at all -- resolve the workspace "
            "through git's common directory rather than this file's location")


@pytest.mark.parametrize("daemon_name,expected", [
    ("colima", "colima-macos"),
    # `colima start --profile work`, straight out of colima's own --help. An
    # exact-match spelling of this test fails here while the detector passes.
    ("colima-work", "colima-macos"),
    ("docker-desktop", "docker-desktop-macos"),
    ("orbstack", "orbstack-macos"),
])
def test_the_macos_runtime_name_selects_its_profile(
        daemon_name, expected, monkeypatch):
    """Named cases, so a wrong *rule* is catchable and not just a wrong call.

    Re-deriving the answer with the production predicate proves only that
    `detect_host_profile` consulted it. These are data: the mapping has to land
    on these names whatever the rule is spelled like.
    """
    monkeypatch.setattr(platform, "system", lambda: "Darwin")
    monkeypatch.setattr(sys.modules[__name__], "_docker_daemon_name",
                        lambda: daemon_name)
    assert detect_host_profile() == expected


def test_every_runtime_the_detector_can_name_has_a_profile_to_select():
    """The two tables are coupled by prose in an error message and nowhere else.

    Adding a prefix without its row passes everything here and fails on the
    first host that has that runtime -- as a `KeyError` inside a mode
    assertion, which reads as a broken harness rather than as a missing row.
    """
    assert set(MACOS_RUNTIMES.values()) <= set(HOST_PROFILES), (
        f"{set(MACOS_RUNTIMES.values()) - set(HOST_PROFILES)} can be detected "
        "but has no HOST_PROFILES row -- add them together")


def test_an_unknown_macos_runtime_fails_rather_than_taking_a_row(monkeypatch):
    """A runtime nobody has measured must not inherit another one's answers.

    Rancher Desktop reports its own name and shares macOS with the three rows
    here. The tier's whole contract is that an unrecognised host fails loudly.

    **The name here has to be a runtime that is still genuinely unknown.** Give
    it one that later earns a row of its own and the case asserts the opposite
    of what it is named for while staying green on the `pytest.raises`.
    """
    monkeypatch.setattr(platform, "system", lambda: "Darwin")
    monkeypatch.setattr(sys.modules[__name__], "_docker_daemon_name",
                        lambda: "rancher-desktop")
    with pytest.raises(AssertionError, match="unrecognised macOS container"):
        detect_host_profile()


def test_the_detected_profile_names_the_runtime_the_daemon_reports():
    """The live machine, against the daemon rather than against a constant.

    **The macOS arm is the one asserted here**, because it is the only one
    where the host OS does not name the runtime. The Linux and WSL2 arms are
    covered by the cases above only as far as the rule is spelled correctly --
    `/proc/version` is unmeasured on this project (`HOST_PROFILES` says so),
    and a test recomputing that expression would agree with the code whether
    or not the rule is right.
    """
    if platform.system() != "Darwin":
        pytest.skip(
            "Linux and WSL2 are named by the host OS itself -- the ambiguity "
            "this asserts against exists only on macOS")

    name = _docker_daemon_name()
    assert detect_host_profile() == macos_profile_for(name), (
        f"the daemon reports {name!r} and the tier selected "
        f"{detect_host_profile()!r} -- detection ignored the machine")


#: This worktree's copy of the stack, and the project name that keeps a run of
#: this tier off whatever the analyst has up. Per xdist worker, which may share
#: this module.
STACK = REPO_ROOT / "compose.yaml"
_WORKER = os.environ.get("PYTEST_XDIST_WORKER", "gw0")
PROJECT = f"incidentcompanion-runtime-test-{_WORKER}"
PORT = 18443 + int(_WORKER.removeprefix("gw"))


def _compose(*args, env=None, **kwargs):
    """`docker compose` against this tier's own project and file.
    """
    return subprocess.run(
        ["docker", "compose", "-p", PROJECT, "-f", str(STACK), *args],
        capture_output=True, text=True, env={**os.environ, **(env or {})},
        **kwargs)


@pytest.fixture(scope="module")
def built_image():
    """The image `docker/app/Dockerfile` builds, through compose rather than by hand.

    **Built through compose so a moved Dockerfile fails here.** A `docker build`
    naming the path directly reports *"lstat .../Dockerfile: no such file or
    directory"* to whoever set the opt-in flag and to nobody else -- the tier is
    opt-in, so every test below skips in silence instead of failing.

    **`--profile migrate`, or the schema one-shot is out of the selection** and
    the push builds its image on first use instead, inside a test.

    The `IC_DATA` passed here and in the `_compose` calls below is left over
    from the bind-mounted volumes and is read by nothing: `compose.yaml` names
    it nowhere.
    """
    build = _compose("--profile", "migrate", "build",
                     env={"IC_DATA": "/tmp/incidentcompanion-build-unused"})
    assert build.returncode == 0, f"docker build failed:\n{build.stderr[-4000:]}"
    yield IMAGE


def _daemon_can_see(directory: Path) -> bool:
    """Does a bind mount of `directory` reach the host, or land in the VM?

    Probed rather than tabulated: the reachable set is a property of the user's
    VM configuration, not of the runtime, so a table row would be wrong the
    first time somebody passes `--mount`.
    """
    marker = directory / ".daemon-visibility-probe"
    marker.write_text("probe")
    try:
        # `sh -c` reporting the answer as *output* rather than as an exit
        # status: a non-zero exit means "not visible" and "the daemon did not
        # run this at all" alike, and the second was reported as the first for
        # a whole run when `~/.docker` was deleted underneath it. That is the
        # misleading diagnostic this function exists to remove, so it may not
        # be the one it emits.
        probed = subprocess.run(
            ["docker", "run", "--rm", "-v", f"{directory}:/probe", IMAGE,
             "sh", "-c",
             "test -f /probe/.daemon-visibility-probe && echo VISIBLE || echo HIDDEN"],
            capture_output=True, text=True)
        answer = probed.stdout.strip().splitlines()[-1:] or [""]
        if answer[0] not in ("VISIBLE", "HIDDEN"):
            raise AssertionError(
                "the visibility probe did not run -- this says nothing about "
                f"{directory}, only that the daemon failed:\n"
                f"{probed.stderr.strip()[-1000:]}")
        return answer[0] == "VISIBLE"
    finally:
        marker.unlink(missing_ok=True)


def _workspace_root() -> Path:
    """The main checkout, which is the directory the dev container binds.

    **`REPO_ROOT` is not it when the tier runs from a worktree**, and that is
    the ordinary case here: worktrees live under `.claude/worktrees`, which is
    a *named volume* mounted only inside the container. So a worktree path
    exists nowhere on the Mac, and a bind source under it is exactly as
    invisible to the daemon as `/tmp` is. Measured with one probe, one run:

        <main checkout>/.container-test-tmp-probe          VISIBLE
        <main>/.claude/worktrees/<name>/.probe2            HIDDEN

    The common git directory is the main checkout's `.git` from every worktree,
    so its parent is the bind-mounted root. Falls back to `REPO_ROOT` when git
    does not answer, which keeps a tarball export working.
    """
    probed = subprocess.run(
        ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
        cwd=REPO_ROOT, capture_output=True, text=True)
    if probed.returncode != 0 or not probed.stdout.strip():
        return REPO_ROOT
    return Path(probed.stdout.strip()).parent


def _bind_mount_roots() -> list[Path]:
    """Parents to try for a bind source, in order, after `tmp_path`.

    A named function rather than inline in the fixture because *which* parents
    are candidates is the decision that was wrong, and a fixture that yields a
    directory can only be tested by running the whole tier against a daemon.

    Ordered by what pytest owns: `tmp_path` first (checked by the caller, since
    it needs no parent), then the repository, then `$HOME`.
    """
    return [
        # **The workspace, because the dev container mounts it host-path-to-
        # same-host-path.** That makes it the one path spelled identically on
        # both sides of the boundary, so a bind source under it resolves for a
        # daemon that resolves against macOS while the client is Debian.
        _workspace_root() / ".container-test-tmp",
        # `pwd`, not `Path.home()` or `$HOME`: the fixtures monkeypatch
        # `Path.home` to a per-test directory for isolation, so the obvious
        # spelling lands back under `tmp_path` and the fallback is no fallback
        # at all. The passwd database is the one answer no fixture rewrites.
        Path(pwd.getpwuid(os.getuid()).pw_dir) / ".incidentcompanion-container-tests",
    ]


@pytest.fixture
def bind_mount_root(built_image, tmp_path):
    """A directory the daemon can actually bind-mount, or a failure naming why.

    `tmp_path` where it is reachable, since that is what pytest cleans up.
    Under a VM mounting only `$HOME` it is not, and the fallback is a directory
    there -- removed in the fixture's teardown, because pytest owns no path
    outside its own root.
    """
    if _daemon_can_see(tmp_path):
        yield tmp_path
        return

    tried = [tmp_path]
    for root in _bind_mount_roots():
        root.mkdir(parents=True, exist_ok=True)
        candidate = Path(tempfile.mkdtemp(dir=root))
        # Cleanup goes in a `finally` per candidate: pytest owns no path
        # outside its own root, so a probe that answers HIDDEN and moves on
        # would leave a directory behind for every candidate on every run.
        try:
            if _daemon_can_see(candidate):
                yield candidate
                return
            tried.append(candidate)
        finally:
            shutil.rmtree(candidate, ignore_errors=True)
            # Only when empty: a concurrent run of this tier owns its own
            # mkdtemp under here, and rmtree would take it with this one.
            with contextlib.suppress(OSError):
                root.rmdir()

    raise AssertionError(
        "the daemon can bind-mount none of "
        + ", ".join(str(p) for p in tried)
        + " -- a source it cannot reach is created inside the VM instead of "
        "failing, so this surfaces as the app never starting. Make one of "
        "them reachable by the daemon -- OrbStack shares the Mac's filesystem, "
        "so a path it cannot see is the surprise and the repository is the "
        "reliable answer from inside the dev container, since the workspace is "
        "mounted host-path-to-same-host-path; Colima needs `colima start "
        "--mount <path>:w`, with the VM stopped -- rather than reading the "
        "next failure as an app defect")


@pytest.fixture
def running_container(built_image):
    """The whole stack, brought up the way an analyst brings it up.

    **One `up`, and the fixture may not sequence anything itself.** A fixture
    that starts the services in order, polls for a connection and applies the
    roles is standing in for the thing under test: these tests then pass
    identically whether the `depends_on` chain works or is entirely broken.

    **Needs no environment**: every volume is Docker-managed, so a fresh one is
    initialised from the image whoever started it.
    """
    env = {"IC_STACK_PORT": str(PORT)}

    _compose("down", "-v", env=env)
    try:
        # `--wait` blocks on every healthcheck and on every one-shot reaching
        # `service_completed_successfully`, which is the ordering itself.
        up = _compose("up", "-d", "--wait", env=env)
        assert up.returncode == 0, (
            f"the stack did not come up from a single `up`, which is the whole "
            f"procedure an analyst follows:\n{up.stderr[-3000:]}")
        yield env
    finally:
        _compose("down", "-v", env=env)


#: The container generates its own certificate, so this client does not verify
#: it. A *client-side* skip, and the only honest one available here -- the app
#: has no plaintext port to fall back to, which is the point. What this tier
#: still proves is that TLS is served at all: without a certificate the app
#: refuses to start and every call below times out.
_UNVERIFIED = ssl._create_unverified_context()


def _wait_for_app(url: str, timeout: float = 60.0) -> int:
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(
                    url, timeout=5, context=_UNVERIFIED) as response:
                return response.status
        except (urllib.error.URLError, ConnectionError, OSError) as exc:
            last = exc
            time.sleep(1)
    raise AssertionError(f"the app never answered on {url}: {last}")


#: `/api/health` rather than `/`: it is public, it needs no session, and its
#: body names which dependency is down -- so a failure here separates "the
#: server never bound" from "the server is up and Postgres is not".
HEALTH = f"https://127.0.0.1:{PORT}/api/health"


def test_the_app_answers_on_the_published_port(running_container):
    """The container binds wide and the publish confines it -- both halves.

    A pass here means the server did not bind its own loopback (which would
    make the published port forward into nothing) *and* it started -- which
    covers the entrypoint minting a secret, the certificate materialising, and
    the schema being there to query.
    """
    assert _wait_for_app(HEALTH) == 200


def test_an_install_at_loopback_is_never_told_to_stay_protected(running_container):
    """A loopback address is every application on the machine, so no response pins it."""
    _wait_for_app(HEALTH)
    with urllib.request.urlopen(HEALTH, timeout=10, context=_UNVERIFIED) as answer:
        assert answer.headers.get_all("Strict-Transport-Security") is None


def test_docker_stop_shuts_down_gracefully_rather_than_being_killed(
        running_container):
    """Not 137, and back well inside the grace period.

    If SIGTERM does not reach node, Docker waits out `stop_grace_period` and
    SIGKILLs -- exit **137** -- and Nest's shutdown hooks never run, so the
    database pool is left for Postgres to reap. A shell or an `npm` between tini
    and node is what causes it, which is why the image's `CMD` is exec form and
    names node directly.

    **143, not 0**: 143 is 128+15, terminated by SIGTERM. That is the correct
    code for a process stopped by a signal, and Nest re-raises after running
    its hooks precisely so the exit reflects it. Demanding 0 would be asking
    the server to lie about why it stopped.

    **Whether the hooks ran is asked of Postgres, not of the app.** The app
    service sets `logging: driver: none`, deliberately, so there is no stream to
    grep for a shutdown line -- but `DbModule` closes the pool in a shutdown
    hook, and the *database* can be asked how many `ic_app` backends are left.
    Hooks that ran drop it to zero at once; hooks that did not leave the
    connections for Postgres to reap on its own timeout. The container being
    silent does not mean the property is unobservable -- it means the observable
    is in the other tier.
    """
    _wait_for_app(HEALTH)

    started_stopping = time.monotonic()
    stopped = _compose("stop", "-t", "20", "app", env={"IC_DATA": "unused"})
    elapsed = time.monotonic() - started_stopping
    assert stopped.returncode == 0, stopped.stderr
    assert elapsed < 15, (
        f"the stop took {elapsed:.1f}s of a 20s grace period, so the signal "
        "was waited out rather than handled")

    listed = _compose("ps", "-a", "-q", "app", env={"IC_DATA": "unused"})
    container = listed.stdout.strip().splitlines()
    assert container, "compose reports no app container to inspect"

    inspected = subprocess.run(
        ["docker", "inspect", container[0], "--format", "{{json .State}}"],
        capture_output=True, text=True, check=True)
    state = json.loads(inspected.stdout)
    assert not state.get("OOMKilled"), "the container was killed for memory, not stopped"
    assert state["ExitCode"] != 137, (
        "the container exited 137, which is SIGKILL after the grace period -- "
        "SIGTERM never reached node, so the shutdown hooks did not close the "
        "pool. A shell or an npm between tini and node is the usual cause")
    assert state["ExitCode"] == 143, (
        f"the container exited {state['ExitCode']} rather than 143 (128+15, "
        "SIGTERM) -- a 0 here means it was already stopped before the signal, "
        "so nothing about the shutdown path was exercised")

    # The pool, asked of the database. Polled rather than read once: the
    # backends go when the server closes them, and "promptly" is not "in the
    # same millisecond as docker's exit status".
    deadline = time.monotonic() + 20
    backends = None
    while time.monotonic() < deadline:
        counted = _compose(
            "exec", "-T", "postgres", "psql", "-tA", "-U", "incidentcompanion",
            "-d", "incidentcompanion", "-c",
            "select count(*) from pg_stat_activity where usename = 'ic_app'",
            env={"IC_DATA": "unused"})
        if counted.returncode == 0 and counted.stdout.strip().isdigit():
            backends = int(counted.stdout.strip())
            if backends == 0:
                break
        time.sleep(1)

    assert backends == 0, (
        f"{backends} ic_app backend(s) are still open after the stop, so the "
        "shutdown hook that closes the pool did not run -- Postgres is left to "
        "reap them on its own timeout")


def test_the_container_writes_its_install_volume(running_container):
    """The container can write its own data, whoever started the stack.

    **The install is not reachable as a host path, deliberately.** The install
    and the evidence are reached through the app and the API, and a volume is
    still openable in an emergency.
    """
    env = running_container
    _wait_for_app(HEALTH)

    listed = _compose("exec", "-T", "app", "ls", "-a", "/install", env=env)
    assert listed.returncode == 0, f"could not read /install: {listed.stderr}"
    entries = [name for name in listed.stdout.split() if name not in (".", "..")]
    assert entries, (
        "the container wrote nothing into /install -- the image's ownership at "
        "that mount point is what makes a fresh managed volume writable, and "
        "this is what its absence looks like")


def test_the_edge_keeps_the_private_key_owner_only(running_container):
    """0600 on the key, asserted where the key now lives.

    The mint runs `umask 077` *and* an explicit `chmod 600`, because they cover
    different windows: the umask closes the creation window, and a truncating
    write over an existing key keeps that file's old mode.
    """
    env = running_container
    # **Waited for, or this races the mint.** `up -d` returns once the
    # container is created; the entrypoint writes the pair before nginx binds,
    # so a request that gets through is the proof the key exists. Without this
    # the exec reports `stat: can't stat` and reads as a mint that never
    # happened rather than as one that had not finished.
    _wait_for_app(HEALTH)

    mode = _compose("exec", "-T", "nginx", "stat", "-c", "%a",
                    "/etc/nginx/certs/key.pem", env=env)
    assert mode.returncode == 0, f"no certificate was minted: {mode.stderr}"
    assert mode.stdout.strip() == "600", (
        f"the private key is mode {mode.stdout.strip()}, not 600 -- every "
        f"process in that container can read it")


def _upgrade(origin: str, path: str, host: str | None = None) -> int:
    """A raw WebSocket handshake through the edge, returning the status code.
    Raw rather than a websocket client: no dependency, and the status line is
    the whole answer.
    """
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE

    with socket.create_connection(("127.0.0.1", PORT), timeout=15) as raw:
        with context.wrap_socket(raw, server_hostname="localhost") as tls:
            request = (
                f"GET {path} HTTP/1.1\r\n"
                f"Host: {host or f'localhost:{PORT}'}\r\n"
                f"Origin: {origin}\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
                "Sec-WebSocket-Version: 13\r\n"
                "\r\n"
            )
            tls.sendall(request.encode())
            head = tls.recv(256).decode(errors="replace")

    if not head:
        return 0  # the edge closed the connection: `return 444`
    return int(head.split(" ", 2)[1])


#: A well-formed uuid that names no case. **The shape matters**: the gateway's
#: `LIVE_PATH` regex rejects anything that is not a uuid *before* it checks the
#: origin, so `does-not-exist` answers 404 for every origin and reads as the
#: probe never arriving.
NO_SUCH_CASE = "/api/cases/00000000-0000-0000-0000-000000000000/live"


def test_a_socket_upgrade_survives_the_proxy(running_container):
    """The install's own origin opens a socket through the edge.

    Presence, claims, the change fan-out and the report CRDT all ride this
    handshake.

    **401, not 200**: this probe carries no cookie, so reaching the session
    check is the pass. A refusal as cross-origin answers **403** before
    authentication is considered.
    """
    _wait_for_app(HEALTH)

    assert _upgrade(f"https://localhost:{PORT}", NO_SUCH_CASE) == 401, (
        "the install's own origin was refused before the session check, so "
        "every WebSocket in the app is dead while every HTTP route answers")


def test_a_socket_upgrade_from_another_origin_is_refused(running_container):
    """The hijack the origin check exists for, through the real edge.

    Without this the test above passes just as well against a gateway that
    admits everything.
    """
    _wait_for_app(HEALTH)

    assert _upgrade("https://evil.test", NO_SUCH_CASE) == 403, (
        "a handshake from another origin was not refused, so a page anywhere "
        "can open a socket onto this case with the analyst's own cookie")


def test_the_edge_closes_an_unrecognised_hostname(running_container):
    """`return 444` on the catch-all, which is what replaced the Host guard.

    TLS terminates at nginx, so a rebound hostname has to be refused there
    rather than by a certificate naming only loopback -- and deleting that
    block leaves every deployment test green while an arbitrary `Host` is
    forwarded to the app verbatim.
    """
    _wait_for_app(HEALTH)

    assert _upgrade(f"https://localhost:{PORT}", NO_SUCH_CASE, host="evil.test") == 0, (
        "an unrecognised hostname was answered rather than closed, so the "
        "protection that replaced the loopback Host guard is not there")


def _status(url: str) -> int:
    """The status, including the 4xx and 5xx `urlopen` raises on.

    Without this a probe asserting `== 200` dies inside urllib with a bare
    `HTTP Error 404` and its own message -- the part that says what the failure
    means -- never runs.
    """
    try:
        with urllib.request.urlopen(url, timeout=10, context=_UNVERIFIED) as response:
            return response.status
    except urllib.error.HTTPError as refused:
        return refused.code


def test_the_api_reference_boots_through_the_edge(running_container):
    """The reference viewer is the one page whose design is about headers.

    So this asks the only question that matters -- does the browser get the
    script -- by fetching it the way the page will. A viewer that renders an
    empty frame answers 200 on the page and 404 on the script, and every other
    tier is green. Break-verified by returning 404 for the script at the edge.

    **Public on purpose**: `/api/docs` and its assets carry `@Public()`, so no
    cookie is involved and a 401 here would be its own defect.
    """
    _wait_for_app(HEALTH)

    with urllib.request.urlopen(
            f"https://127.0.0.1:{PORT}/api/docs", timeout=10, context=_UNVERIFIED) as page:
        assert page.status == 200, "the reference page did not answer through the edge"
        body = page.read().decode("utf-8", "replace")

    assert "/api/docs/boot.js" in body, (
        "the page no longer names its boot script, so this probe is asserting "
        "nothing about the viewer -- re-derive the asset it actually loads")

    assert _status(f"https://127.0.0.1:{PORT}/api/docs/boot.js") == 200, (
        "the page loads but its boot script does not, so the reference renders "
        "an empty frame -- the asset mount is not reachable through nginx")

    assert _status(f"https://127.0.0.1:{PORT}/api/openapi.json") == 200, (
        "the viewer booted with nothing to render: the document it fetches is "
        "not being served through the edge")




def _refused(url: str, method: str = "GET") -> tuple[int, str | None, str]:
    """Status, `Retry-After`, and the content type that says who refused.

    `urlopen` raises on a 429 and the headers a caller acts on are on the
    exception rather than on a response, so a probe written the obvious way
    reads them off nothing.

    **The content type is the discriminator, and this file needs one.** Three
    limiters answer 429 on these paths: nginx's two zones, the app's throttler,
    and Better Auth's own. Only nginx renders its error page as `text/html`;
    the other two answer JSON and name the wait under their own spellings. A
    probe filtering on status alone asserts the edge's contract against
    whichever of the three happened to refuse first.
    """
    request = urllib.request.Request(url, method=method)
    try:
        with urllib.request.urlopen(request, timeout=10, context=_UNVERIFIED) as response:
            return response.status, response.headers.get("Retry-After"), \
                response.headers.get("Content-Type", "")
    except urllib.error.HTTPError as refusal:
        return refusal.code, refusal.headers.get("Retry-After"), \
            refusal.headers.get("Content-Type", "")


def _storm(url: str, n: int) -> list[tuple[int, str | None, str]]:
    """`n` at once. Sequentially, a rate window outlasts the loop and nothing
    is ever exceeded."""
    with ThreadPoolExecutor(max_workers=min(n, 64)) as pool:
        return list(pool.map(lambda _: _refused(url), range(n)))


def _edge_refusals(answers):
    return [(code, told) for code, told, kind in answers
            if code == 429 and "text/html" in kind]


#: `ic_auth` is 10r/m with `burst=20`, so this clears the burst; `ic_all` is
#: 30r/s with `burst=60`, so the root location needs rather more.
_AUTH_STORM = 40
_ROOT_STORM = 120


def test_the_edge_tells_a_refused_caller_when_to_come_back_on_the_credential_paths(
        running_container):
    """*It is refused, AND told when it may try again* -- where the edge is the
    only limiter a deployment is guaranteed.
    **A path the app does not serve**, so no credential attempt is spent:
    `ic_auth` counts the request whatever the app would have answered.
    """
    _wait_for_app(HEALTH)
    answers = _storm(f"https://127.0.0.1:{PORT}/api/auth/not-a-real-route", _AUTH_STORM)

    refused = _edge_refusals(answers)
    assert refused, (
        "the edge refused nothing, so this asserts nothing about its refusal -- "
        f"seen: {sorted({(code, kind) for code, _, kind in answers})}")

    for _, told in refused:
        assert told == "6", (
            f"the edge refused with Retry-After {told!r}. `ic_auth` is 10r/m, so a "
            "caller obeying anything shorter is refused again")


def test_the_edge_tells_a_refused_caller_when_to_come_back_on_every_other_path(
        running_container):
    """The same, for the location that serves the rest of the app.

    **Its own test because its own handler.** The two locations carry separate
    `error_page` lines and separate waits, so a test that only storms
    `/api/auth/*` passes with the root location's handler deleted -- which is
    the original defect, restored for every route an analyst actually uses.
    """
    _wait_for_app(HEALTH)
    answers = _storm(f"https://127.0.0.1:{PORT}/not-a-real-route", _ROOT_STORM)

    refused = _edge_refusals(answers)
    assert refused, (
        "the edge refused nothing, so this asserts nothing about its refusal -- "
        f"seen: {sorted({(code, kind) for code, _, kind in answers})}")

    for _, told in refused:
        assert told == "1", (
            f"the edge refused with Retry-After {told!r}, which is not what this "
            "location's handler names for `ic_all`")


def test_a_response_the_edge_did_not_refuse_carries_no_retry_time(running_container):
    """The other half of `add_header ... always`, and the reason for the seam.

    `always` is what makes a header reach a 429 at all, and it reaches every
    other status too -- so set in the location rather than in the handler that
    renders the refusal, it would tell a caller whose request succeeded to come
    back later.

    **Both locations**, because the mistake can be made in either and a probe
    of one would not see it. The credential path has no anonymous 200, so what
    is asserted there is a refusal of a different kind: Better Auth's own,
    which is JSON and carries its own spelling.
    """
    _wait_for_app(HEALTH)

    with urllib.request.urlopen(HEALTH, timeout=10, context=_UNVERIFIED) as ok:
        assert ok.status == 200
        assert ok.headers.get("Retry-After") is None, (
            "a response the edge did not refuse carries a retry time, so the "
            "header is on everything rather than on the refusal")

    code, told, _ = _refused(f"https://127.0.0.1:{PORT}/api/auth/not-a-real-route")
    assert code != 429, (
        "the credential zone was already exhausted, so this says nothing about "
        "an unrefused response through that location")
    assert told is None, (
        f"a {code} through the credential location carries Retry-After {told!r}, so "
        "that location's header is on everything rather than on its refusal")
