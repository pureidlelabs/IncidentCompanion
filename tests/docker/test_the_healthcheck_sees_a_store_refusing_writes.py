"""A store that refuses every write is not healthy, and the check says so.

**`depends_on: condition: service_healthy` is what this decides.** Redis holds
the session tokens, so a healthcheck that passes while writes are refused
brings the stack up and reports it well; what an operator meets is nobody able
to sign in, minutes after a clean start, with every container green. -> #623

**`PING` cannot see it, and neither can the exit code.** A refusal arrives as
an error reply, and `redis-cli` exits 0 on one -- measured at exit 0 with the
MISCONF text on stdout. So a check built on the command succeeding is blind
twice over.

**Read-only, and it asks Redis what it already knows.**
`stop-writes-on-bgsave-error` is what turns a failed save into a refusal, and
Redis reports that state itself. Writing a probe key would also detect it, at
the cost of a write into the analyst's own store every two seconds for the
life of the stack.

**What this does not cover:** postgres, whose readiness has its own shape, and
whether any other condition refuses writes without showing in these two
fields -- `maxmemory` with `noeviction` is one, and it is not covered here.
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

IMAGE = (
    "redis:8.10-alpine@sha256:"
    "becdda6c7f4b3fb42e42fd7f120bbf5c54c4caaaf16f26da24e4563d2c1f0576"
)


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
    service = yaml.safe_load(path.read_text(encoding="utf-8"))["services"]["redis"]
    test = service["healthcheck"]["test"]
    if test[0] == "CMD-SHELL":
        return ["sh", "-c", test[1].replace("$$", "$")]
    assert test[0] == "CMD", f"{path} declares an unknown healthcheck form: {test[0]!r}"
    return list(test[1:])


class Redis:
    """A container that can be made unable to persist, and asked the check.

    **The command comes from the compose file, password and all.** One file
    declares `--requirepass` and the other declares nothing; a probe that
    always sets a password asks the passwordless check to authenticate and
    reads the refusal as the defect under test.
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
        argv += [IMAGE, *self.command()]
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
        redis.cli("bgsave")
        time.sleep(1)
        asked = redis.asked(check)

    assert asked.returncode == 0, (
        f"the healthcheck {named} declares refuses a store that is answering and saving, so "
        f"the stack would never come up.\n{asked.stdout}{asked.stderr}"
    )
