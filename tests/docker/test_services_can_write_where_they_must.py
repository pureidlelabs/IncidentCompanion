"""Redis drops to its own user and can save, as each compose file declares it.

**`test_container_config.py` reads the declaration; this runs it.** That file
holds each service's `cap_add` against a justified list, which catches a
capability nobody argued for and cannot catch the opposite -- a service needing
one it does not ask for. Those are different failures and only one of them is
visible in the file.

**The failure this exists for starts clean and breaks later.** `cap_drop: [ALL]`
with no `cap_add` left the entrypoint unable to drop root to `redis`, so it
stayed root -- and root without `CAP_DAC_OVERRIDE` cannot write a directory
owned by somebody else. The container starts, answers `PING`, serves from
memory, and refuses every write minutes later when its first background save
fails, because `stop-writes-on-bgsave-error` is on by default. Redis holds the
session tokens, so on an install that reads as nobody being able to sign in.
-> #620

**Through the real entrypoint, against a fresh managed volume.** The drop
happens in the entrypoint and only when the command is `redis-server`, so a
probe that runs `/bin/sh` measures a container the stack never starts -- this
file's first draft did that and reported postgres broken when it is not. The
volume matters for the same reason: Docker creates it owned by the image's
user, which is the thing the entrypoint's chown is reconciling.

**Both compose files, because both declare it and both were wrong.** The stack
an operator runs and the one the suite runs are different files, and a fix to
one leaves the other failing where fewer people look.
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


def redis_service(path) -> dict:
    service = yaml.safe_load(path.read_text(encoding="utf-8")).get("services", {}).get("redis")
    assert service, f"{path} declares no redis service"
    return service


def docker(*argv: str) -> subprocess.CompletedProcess:
    return subprocess.run(["docker", *argv], capture_output=True, text=True, check=False)


class Started:
    """One Redis container carrying the declaration's own image and capabilities.

    Taken from the compose file rather than restated, so a case cannot pass
    against a container the stack does not run. Removes the container and its
    volume on the way out whatever happened.
    """

    def __init__(self, service: dict) -> None:
        self.service = service
        self.name = f"ic-redis-probe-{uuid.uuid4().hex[:8]}"
        self.volume = f"{self.name}-data"

    def __enter__(self) -> "Started":
        argv = ["run", "-d", "--name", self.name, "-v", f"{self.volume}:/data"]
        for dropped in self.service.get("cap_drop", []):
            argv += ["--cap-drop", str(dropped)]
        for added in self.service.get("cap_add", []):
            argv += ["--cap-add", str(added)]
        for option in self.service.get("security_opt", []):
            argv += ["--security-opt", str(option)]
        if self.service.get("user"):
            argv += ["--user", str(self.service["user"])]
        # The image's own entrypoint, and the command that makes it drop.
        argv += [str(self.service["image"]), "redis-server", "--dir", "/data"]
        self.started = docker(*argv)
        return self

    def __exit__(self, *_: object) -> None:
        docker("rm", "-f", self.name)
        docker("volume", "rm", "-f", self.volume)

    def ready(self) -> bool:
        for _ in range(50):
            if docker("exec", self.name, "redis-cli", "ping").stdout.strip() == "PONG":
                return True
            time.sleep(0.2)
        return False

    def saved(self) -> str:
        docker("exec", self.name, "redis-cli", "bgsave")
        for _ in range(50):
            info = docker("exec", self.name, "redis-cli", "info", "persistence").stdout
            if "rdb_bgsave_in_progress:0" in info:
                return info
            time.sleep(0.2)
        return docker("exec", self.name, "redis-cli", "info", "persistence").stdout

    def server_user(self) -> str:
        for line in docker("exec", self.name, "ps", "-o", "user,comm").stdout.splitlines():
            if "redis-server" in line:
                return line.split()[0]
        return ""


def available(named: str) -> None:
    if not shutil.which("docker"):
        declined(f"the redis probe for {named}", "docker is not on PATH")
    if "Cannot connect to the Docker daemon" in docker("info").stderr:
        declined(f"the redis probe for {named}", "the docker daemon is not answering")


@pytest.mark.parametrize("named", sorted(COMPOSE))
def test_redis_can_save_as_declared(named: str) -> None:
    available(named)

    with Started(redis_service(COMPOSE[named])) as running:
        assert running.ready(), (
            f"redis as {named} declares it never answered PING.\n{running.started.stderr}"
        )
        info = running.saved()

    assert "rdb_last_bgsave_status:ok" in info, (
        f"redis as {named} declares it cannot save, so it refuses every write once this "
        f"fails.\n{info}"
    )


@pytest.mark.parametrize("named", sorted(COMPOSE))
def test_redis_server_does_not_run_as_root(named: str) -> None:
    """Staying root is how it came to be unable to write its own directory.

    Asserted beside the save rather than instead of it: an image that chowned
    on the way in would save happily as root, and would still be the container
    holding session tokens running with more than it needs.
    """
    available(named)

    with Started(redis_service(COMPOSE[named])) as running:
        assert running.ready(), f"redis as {named} declares it never answered PING"
        who = running.server_user()

    assert who and who != "root", (
        f"redis-server runs as {who or 'nobody findable'} under {named}, so the entrypoint "
        "did not drop and `cap_drop: [ALL]` is all that stands between it and the host"
    )
