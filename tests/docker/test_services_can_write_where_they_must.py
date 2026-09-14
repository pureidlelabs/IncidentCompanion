"""Redis runs as its own user and can save, as each compose file declares it.

`test_container_config.py` reads the declaration; this runs it. That file holds
each service's `cap_add` against a justified list, which catches a capability
nobody argued for and cannot catch the opposite -- a service needing one it
does not ask for.

**The failure this exists for starts clean and breaks later.** Redis answers
`PING` throughout, so the compose healthcheck reports the stack healthy while
every write is refused. -> #620

**What this does not cover:** postgres, whose entrypoint prepares its directory
as root before dropping and is a different shape; and whether the healthcheck
can see a Redis that is refusing writes, which it cannot. -> #623
"""

from __future__ import annotations

import shutil
import subprocess
import time
import uuid

import pytest
import yaml

from tests._must_run import declined
from tests._repo import REPO_ROOT

COMPOSE = {
    "compose.yaml": REPO_ROOT / "compose.yaml",
    "server/compose.dev.yaml": REPO_ROOT / "server" / "compose.dev.yaml",
}

#: Stands in for `${IC_REDIS_PASSWORD}` where the declared command wants it.
#: The container lives for one case and publishes no port.
PASSWORD = "probe-password"


def redis_service(path) -> dict:
    service = yaml.safe_load(path.read_text(encoding="utf-8")).get("services", {}).get("redis")
    assert service, f"{path} declares no redis service"
    return service


def docker(*argv: str) -> subprocess.CompletedProcess:
    return subprocess.run(["docker", *argv], capture_output=True, text=True, check=False)


class Started:
    """One Redis container, declared as the compose file declares it.

    Image, user, capabilities, security options **and the command** are taken
    from the file. Substituting the command would test a container the stack
    never starts, and the command is the line in this service somebody is most
    likely to edit.

    Removes the container on the way out whatever happened.
    """

    def __init__(self, service: dict) -> None:
        self.service = service
        self.name = f"ic-redis-probe-{uuid.uuid4().hex[:8]}"

    def __enter__(self) -> "Started":
        argv = ["run", "-d", "--name", self.name]
        for dropped in self.service.get("cap_drop", []):
            argv += ["--cap-drop", str(dropped)]
        for added in self.service.get("cap_add", []):
            argv += ["--cap-add", str(added)]
        for option in self.service.get("security_opt", []):
            argv += ["--security-opt", str(option)]
        if self.service.get("user"):
            argv += ["--user", str(self.service["user"])]
        argv += [str(self.service["image"]), *self.command()]
        self.started = docker(*argv)
        return self

    def __exit__(self, *_: object) -> None:
        docker("rm", "-f", self.name)

    def command(self) -> list[str]:
        """The declared command, with the password variable filled in."""
        return [
            PASSWORD if "IC_REDIS_PASSWORD" in str(word) else str(word)
            for word in self.service.get("command", ["redis-server"])
        ]

    def cli(self, *argv: str) -> str:
        return docker(
            "exec", self.name, "redis-cli", "--no-auth-warning", "-a", PASSWORD, *argv
        ).stdout.strip()

    def ready(self) -> bool:
        for _ in range(50):
            if self.cli("ping") == "PONG":
                return True
            time.sleep(0.2)
        return False

    def server_user(self) -> str:
        for line in docker("exec", self.name, "ps", "-o", "user,comm").stdout.splitlines():
            if "redis-server" in line:
                return line.split()[0]
        return ""


def available(named: str) -> None:
    if not shutil.which("docker"):
        declined(f"the Redis probe for {named}", "docker is not on PATH")
    if docker("info").returncode != 0:
        declined(f"the Redis probe for {named}", "the docker daemon is not answering")


@pytest.mark.parametrize("named", sorted(COMPOSE))
def test_redis_can_save_as_declared(named: str) -> None:
    """A save is asked for and shown to have happened.

    **`rdb_last_bgsave_status:ok` is what a Redis that has never saved reports**,
    so asserting it alone passes on a container that was never asked. A pending
    write is made first and the count of writes still unsaved has to come back
    to nothing. The last-save time cannot do that job: it is a whole-second
    timestamp, so a save completing inside the same second leaves it unmoved
    and the case fails on a Redis that saved perfectly well.
    """
    available(named)

    with Started(redis_service(COMPOSE[named])) as running:
        assert running.ready(), (
            f"redis as {named} declares it never answered PING.\n{running.started.stderr}"
        )
        running.cli("set", "a-key", "a-value")
        pending = running.cli("info", "persistence")
        reply = running.cli("bgsave")

        for _ in range(50):
            status = running.cli("info", "persistence")
            if "rdb_changes_since_last_save:0" in status and "rdb_bgsave_in_progress:0" in status:
                break
            time.sleep(0.2)
        wrote = docker("exec", running.name, "ls", "-l", "/data/dump.rdb").stdout.strip()

    assert "rdb_changes_since_last_save:0" not in pending, (
        "the write did not register as unsaved, so the assertion below would pass over a save "
        f"that had nothing to do.\n{pending}"
    )
    assert reply == "Background saving started", (
        f"redis as {named} declares it refused the save outright: {reply!r}"
    )
    assert "rdb_changes_since_last_save:0" in status, (
        f"the write is still unsaved, so no save completed.\n{status}"
    )
    assert "rdb_last_bgsave_status:ok" in status, (
        f"redis as {named} declares it cannot save, so it refuses every write once this "
        f"fails.\n{status}"
    )
    assert "dump.rdb" in wrote, f"the save reported success and wrote no file: {wrote!r}"


@pytest.mark.parametrize("named", sorted(COMPOSE))
def test_redis_writes_after_a_save(named: str) -> None:
    """The symptom an operator meets: writes refused, minutes after a clean start.

    `stop-writes-on-bgsave-error` is on by default, so a failed save turns into
    a refusal of every command that modifies data. Redis holds the session
    tokens.
    """
    available(named)

    with Started(redis_service(COMPOSE[named])) as running:
        assert running.ready(), f"redis as {named} declares it never answered PING"
        running.cli("bgsave")
        time.sleep(1)
        answered = running.cli("set", "session", "token")

    assert answered == "OK", (
        f"redis as {named} declares it refuses writes after a save: {answered!r}"
    )


@pytest.mark.parametrize("named", sorted(COMPOSE))
def test_redis_server_does_not_run_as_root(named: str) -> None:
    """Staying root is how it came to be unable to write its own directory."""
    available(named)

    with Started(redis_service(COMPOSE[named])) as running:
        assert running.ready(), f"redis as {named} declares it never answered PING"
        who = running.server_user()

    assert who and who != "root", (
        f"redis-server runs as {who or 'nobody findable'} under {named}, so `cap_drop: [ALL]` "
        "is all that stands between it and the host"
    )


@pytest.mark.parametrize("named", sorted(COMPOSE))
def test_redis_keeps_no_capability(named: str) -> None:
    """The bounding set is empty, which pinning the user is what buys.

    Handing back SETGID and SETUID for the entrypoint to drop with leaves both
    in the bounding set for the life of the process; `openspec/specs/deployment`
    asks for no capability a part does not use.
    """
    available(named)

    with Started(redis_service(COMPOSE[named])) as running:
        assert running.ready(), f"redis as {named} declares it never answered PING"
        status = docker("exec", running.name, "grep", "CapBnd", "/proc/1/status").stdout

    held = status.split()[1] if status.split() else ""
    assert held.strip("0") == "", (
        f"redis as {named} declares it keeps capabilities {held!r} it never uses"
    )
