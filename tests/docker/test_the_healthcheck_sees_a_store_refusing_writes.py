"""A store that refuses every write is not healthy, and the check says so.

**`depends_on: condition: service_healthy` is what this decides.** Redis holds
the session tokens, so a healthcheck that passes while writes are refused
brings the stack up and reports it well; what an operator meets is nobody able
to sign in, minutes after a clean start, with every container green. -> #623

**`PING` does see it; the exit code does not.** Redis excepts `PING` from the
refusal so a check can reach it, and answers with the refusal itself -- which
`redis-cli` then reports at exit 0, because it exits 0 on an error reply. So
a check built on the command succeeding is blind to a store that is telling it
plainly.

**What this does not cover:** postgres, whose readiness has its own shape, and
any condition that refuses writes without `PING` saying so -- `maxmemory` with
`noeviction` is one, measured as answering `PONG` throughout, and only a probe
that writes would see it.
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

PASSWORD = "probe-password"


def docker(*argv: str) -> subprocess.CompletedProcess:
    return subprocess.run(["docker", *argv], capture_output=True, text=True, check=False)


def service_of(path) -> dict:
    """The Redis service as the compose file declares it."""
    return yaml.safe_load(path.read_text(encoding="utf-8"))["services"]["redis"]


def declared_check(path) -> list[str]:
    """The healthcheck the compose file declares, as a command to run.

    Taken from the file rather than restated: a case asserting a command
    written here would pass against a stack running a different one. `$$` is
    compose's own escape for a literal `$`.
    """
    test = service_of(path)["healthcheck"]["test"]
    if test[0] == "CMD-SHELL":
        return ["sh", "-c", test[1].replace("$$", "$")]
    assert test[0] == "CMD", f"{path} declares an unknown healthcheck form: {test[0]!r}"
    return list(test[1:])


class Redis:
    """A container that can be made unable to persist, and asked the check.

    **Image, command and capabilities all come from the compose file.** One
    file declares `--requirepass` and the other declares nothing; a probe that
    always sets a password asks the passwordless check to authenticate and
    reads the refusal as the defect under test. The image is read for the same
    reason, and because a digest written here would be a third place to bump.
    """

    def __init__(self, service: dict, *, can_persist: bool) -> None:
        self.service = service
        self.can_persist = can_persist
        self.name = f"ic-health-probe-{uuid.uuid4().hex[:8]}"

    def command(self) -> list[str]:
        return [
            PASSWORD if "IC_REDIS_PASSWORD" in str(word) else str(word)
            for word in self.service.get("command", ["redis-server"])
        ]

    def guarded(self) -> bool:
        return any("requirepass" in str(word) for word in self.service.get("command", []))

    def __enter__(self) -> "Redis":
        argv = ["run", "-d", "--name", self.name, "--cap-drop", "ALL"]
        argv += ["--security-opt", "no-new-privileges:true"]
        argv += ["--env", f"IC_REDIS_PASSWORD={PASSWORD}"]
        # Running as `redis` is what lets it write `/data`; staying root with
        # no capabilities is the shape that cannot, which is how #620 shipped.
        if self.can_persist:
            argv += ["--user", "redis"]
        argv += [str(self.service["image"]), *self.command()]
        docker(*argv)
        for _ in range(50):
            if self.cli("ping") == "PONG":
                break
            time.sleep(0.2)
        return self

    def __exit__(self, *_: object) -> None:
        docker("rm", "-f", self.name)

    def cli(self, *argv: str) -> str:
        auth = ["--no-auth-warning", "-a", PASSWORD] if self.guarded() else []
        return docker("exec", self.name, "redis-cli", *auth, *argv).stdout.strip()

    def make_it_refuse(self) -> None:
        """Ask for a save that cannot succeed, which latches the refusal."""
        self.cli("bgsave")
        for _ in range(50):
            if "rdb_last_bgsave_status:err" in self.cli("info", "persistence"):
                return
            time.sleep(0.2)

    def saves_after_one(self) -> bool:
        """Ask for a save and wait for Redis to record that one completed.

        Polled rather than slept on: a fixed wait on a loaded machine reads a
        save still running as a save that failed.
        """
        self.cli("bgsave")
        for _ in range(50):
            status = self.cli("info", "persistence")
            if "rdb_bgsave_in_progress:0" in status and "rdb_last_bgsave_status:ok" in status:
                return "rdb_saves:0" not in status
            time.sleep(0.2)
        return False

    def asked(self, check: list[str]) -> subprocess.CompletedProcess:
        return docker("exec", self.name, *check)


def available(named: str) -> None:
    if not shutil.which("docker"):
        declined(f"the healthcheck probe for {named}", "docker is not on PATH")
    if docker("info").returncode != 0:
        declined(f"the healthcheck probe for {named}", "the docker daemon is not answering")


@pytest.mark.parametrize("named", sorted(COMPOSE))
def test_the_check_refuses_a_store_that_refuses_writes(named: str) -> None:
    available(named)
    check = declared_check(COMPOSE[named])

    with Redis(service_of(COMPOSE[named]), can_persist=False) as redis:
        redis.make_it_refuse()
        refused = redis.cli("set", "session", "token")
        asked = redis.asked(check)

    assert "MISCONF" in refused, (
        f"the fixture is not refusing writes, so this asserts nothing: {refused!r}"
    )
    assert asked.returncode != 0, (
        f"the healthcheck {named} declares reports a store refusing every write as healthy, so "
        f"`depends_on: service_healthy` brings the stack up on it.\n{asked.stdout}{asked.stderr}"
    )


@pytest.mark.parametrize("named", sorted(COMPOSE))
def test_the_check_passes_a_store_that_is_well(named: str) -> None:
    """The other half: a check that refuses everything would also pass the case above."""
    available(named)
    check = declared_check(COMPOSE[named])

    with Redis(service_of(COMPOSE[named]), can_persist=True) as redis:
        saved = redis.saves_after_one()
        asked = redis.asked(check)

    assert saved, (
        "the save did not complete, so the case below proves less than it says -- a slow "
        "failing save would read the same as a store that is well"
    )
    assert asked.returncode == 0, (
        f"the healthcheck {named} declares refuses a store that is answering and saving, so "
        f"the stack would never come up.\n{asked.stdout}{asked.stderr}"
    )
