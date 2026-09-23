"""The shipped stack, through its whole life, with nothing lost and nothing sent out.

One install is started, written to, started again, stopped, destroyed and
recreated, has each store restarted under it, crashes, starts with no order,
is copied and returned to, and is offered a shape that would lose data. The
network it lives on is captured throughout. Each phase is a subtest, run in
order on the one install, because each is a moment in that install's life.

Opt-in (`INCIDENTCOMPANION_LIFECYCLE_TESTS=1`): it builds the images. What it
cannot do is restart the daemon itself; the unordered start stands in for that.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path

import pytest

from tests._must_run import declined
from tests._repo import REPO_ROOT
from tests.lifecycle._stack import PolicyWatcher, Stack

BACKUP = REPO_ROOT / "docker" / "backup.sh"
PASSWORD = "lifecycle-passphrase-1234"
EMAIL = "first.administrator@example.test"
ARTEFACT = b"an artefact that must survive every phase\n" * 64
LONG_LIVED = ("postgres", "redis", "app", "nginx")
ONE_SHOTS = ("roles", "migrate", "seed")


def terminal(argv: list[str]) -> list[str]:
    """`argv` behind a pseudo-terminal, as an operator typing it gets."""
    if sys.platform == "darwin":
        return ["script", "-q", "-e", "/dev/null", *argv]
    return ["script", "-q", "-e", "-c", " ".join(f"'{word}'" for word in argv), "/dev/null"]


@pytest.fixture(scope="module")
def stack():
    if os.environ.get("INCIDENTCOMPANION_LIFECYCLE_TESTS", "") != "1":
        declined("The lifecycle tier", "INCIDENTCOMPANION_LIFECYCLE_TESTS is not 1 (it builds and runs the shipped stack)")
    if not shutil.which("docker") or subprocess.run(["docker", "info"], capture_output=True).returncode:
        declined("The lifecycle tier", "no Docker daemon is reachable")
    secrets = subprocess.run(["sh", str(REPO_ROOT / "docker" / "secrets.sh")], capture_output=True, text=True)
    assert secrets.returncode == 0, secrets.stderr
    stacks: list[Stack] = []

    def make(suffix: str = "") -> Stack:
        made = Stack(f"ic-life-{os.getpid()}{suffix}")
        stacks.append(made)
        return made

    try:
        yield make
    finally:
        for one in stacks:
            one.down()


def test_the_shipped_stack_lives_through_its_lifecycle(stack, subtests):
    install = stack()
    held: dict = {}

    def images() -> dict[str, str]:
        config = json.loads(install.must("config", "--format", "json"))
        # A reference pinned by digest cannot move, and the engine may report
        # a multi-platform image's id differently once its layers are unpacked.
        names = sorted({service["image"] for service in config["services"].values()
                        if "@sha256:" not in service["image"]})
        return {name: subprocess.run(["docker", "image", "inspect", "-f", "{{.Id}}", name],
                                     capture_output=True, text=True).stdout.strip() for name in names}

    def same_images() -> None:
        # The tags are fixed, so another checkout's build moves them under this one.
        assert images() == held["images"], "an image tag moved during the run; another build ran"

    def signed_in() -> None:
        answer = install.edge.request("POST", "/api/auth/sign-in/email",
                                      {"email": EMAIL, "password": PASSWORD})
        assert answer.status == 200, (answer.status, answer.body[:300])

    def notes(case: str) -> list[str]:
        answer = install.edge.request("GET", f"/api/cases/{case}/casenotes")
        assert answer.status == 200, (answer.status, answer.body[:300])
        return [row["note"] for row in answer.json()]

    def write_note(case: str, text: str):
        return install.edge.request("POST", f"/api/cases/{case}/casenotes", {"note": text})

    with subtests.test(msg="first start: one command, preparation first, only the edge published"):
        install.must("build", timeout=1800)
        held["images"] = images()
        install.must("up", "--no-start")
        install.capture.attach()
        token = install.first_start()
        install.must("up", "-d", "--wait")
        claimed = install.edge.request("POST", "/api/setup", {
            "token": token, "username": EMAIL, "password": PASSWORD, "repeat": PASSWORD})
        assert claimed.status in (200, 201), (claimed.status, claimed.body[:300])
        signed_in()
        health = install.wait_for_health(200).json()
        assert set(health["info"]) == {"postgres", "redis"}, health
        published = [(one["Service"], p["PublishedPort"])
                     for one in map(json.loads, install.must("ps", "--format", "json").splitlines())
                     for p in one.get("Publishers") or [] if p.get("PublishedPort")]
        assert {service for service, _ in published} == {"nginx"}, published
        demos = install.edge.request("GET", "/api/demos").json()
        assert demos, "an unclaimed first start wrote no demonstration case"
        held["demo"] = demos[0]["id"]

    with subtests.test(msg="a persisted write: a case, a note, an evidence file, a note in a demo"):
        made = install.edge.request("POST", "/api/cases", {"title": "Lifecycle"})
        assert made.status in (200, 201), (made.status, made.body[:300])
        held["case"] = made.json()["id"]
        assert write_note(held["case"], "kept through every phase").status in (200, 201)
        assert write_note(held["demo"], "an analyst wrote in a demo").status in (200, 201)
        item = install.edge.request("POST", f"/api/cases/{held['case']}/evidence", {"name": "mail.eml"})
        assert item.status in (200, 201), (item.status, item.body[:300])
        stored = install.edge.request(
            "POST", f"/api/cases/{held['case']}/evidence/{item.json()['id']}/file", ARTEFACT,
            {"content-type": "application/octet-stream", "x-original-filename": "mail.eml"})
        assert stored.status == 200, (stored.status, stored.body[:300])
        assert stored.json()["hash"] == hashlib.sha256(ARTEFACT).hexdigest()
        held["fingerprint"] = install.fingerprint()
        held["policies"] = int(install.sql("select count(*) from pg_policies where schemaname = 'public'"))

    with subtests.test(msg="preparation runs again beside the serving app and changes nothing"):
        same_images()
        reads: list[tuple[int, int]] = []
        with PolicyWatcher(install) as watcher:
            again = subprocess.Popen([*install.compose_argv(), "up", "-d"], env=install.env,
                                     cwd=REPO_ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            while again.poll() is None:
                answer = install.edge.request("GET", f"/api/cases/{held['case']}/casenotes")
                reads.append((answer.status, len(answer.json() or [])))
                time.sleep(0.05)
        assert again.returncode == 0, again.stdout.read().decode()[-3000:]
        for one_shot in ONE_SHOTS:
            assert install.container(one_shot)["State"]["ExitCode"] == 0, one_shot
        assert watcher.counts and min(watcher.counts) == held["policies"], (
            f"a session saw {min(watcher.counts or [0])} of {held['policies']} policies")
        assert reads and all(read == (200, 1) for read in reads), (
            f"a read answered other than the one note: {sorted(set(reads))}")
        assert install.fingerprint() == held["fingerprint"]

    with subtests.test(msg="stopped, and started again on the same volumes"):
        same_images()
        install.must("stop")
        install.must("up", "-d", "--wait")
        install.wait_for_health(200)
        assert install.fingerprint() == held["fingerprint"]

    with subtests.test(msg="destroyed and recreated, keeping the store, evidence, identity and certificate"):
        same_images()
        install.must("down")
        install.must("up", "--no-start")
        install.capture.attach()
        install.must("up", "-d", "--wait")
        install.wait_for_health(200)
        assert install.fingerprint() == held["fingerprint"]

    with subtests.test(msg="postgres restarts under the serving app: 503 naming it, then serving"):
        same_images()
        before = install.container("app")["State"]
        install.must("stop", "postgres")
        for _ in range(5):
            answer = install.edge.health()
            assert answer is not None and answer.status == 503, answer and (answer.status, answer.body[:300])
            assert "postgres" in answer.json()["error"], answer.body[:300]
            time.sleep(0.5)
        install.must("start", "postgres")
        install.wait_for_health(200, within=60)
        assert write_note(held["case"], "written after postgres came back").status in (200, 201)
        assert "written after postgres came back" in notes(held["case"])
        after = install.container("app")["State"]
        assert (after["Pid"], after["StartedAt"]) == (before["Pid"], before["StartedAt"]), (
            "the app did not outlive its store's restart")
        held["fingerprint"] = install.fingerprint()

    with subtests.test(msg="redis stops under the serving app: 503 naming it, a write refused, then serving"):
        same_images()
        install.must("stop", "redis")
        for _ in range(5):
            answer = install.edge.health()
            assert answer is not None and answer.status == 503, answer and (answer.status, answer.body[:300])
            assert "redis" in answer.json()["error"], answer.body[:300]
            time.sleep(0.5)
        refused = write_note(held["case"], "written while redis was away")
        assert refused.status >= 400, (refused.status, refused.body[:300])
        install.must("start", "redis")
        install.wait_for_health(200, within=60)
        if install.edge.request("GET", "/api/cases").status == 401:
            signed_in()
        answered = []
        for _ in range(10):
            answered.append(install.edge.request("GET", f"/api/cases/{held['case']}/casenotes").status)
            time.sleep(0.5)
        assert set(answered) == {200}, f"health said well while reads answered {answered}"
        assert "written while redis was away" not in notes(held["case"])
        assert install.fingerprint() == held["fingerprint"]

    with subtests.test(msg="the server process dies and is started again"):
        same_images()
        restarts = install.container("app")["RestartCount"]
        install.must("exec", "-T", "app", "sh", "-c", "kill -9 $(cat /proc/1/task/1/children)")
        deadline = time.monotonic() + 60
        while install.container("app")["RestartCount"] == restarts:
            assert time.monotonic() < deadline, "the app was not started again"
            time.sleep(1)
        install.wait_for_health(200, within=60)
        assert install.fingerprint() == held["fingerprint"]

    with subtests.test(msg="an unordered start: the edge and the server before the stores"):
        same_images()
        oneshots = {name: install.container(name)["State"]["StartedAt"] for name in ONE_SHOTS}
        install.must("stop")
        ids = {name: install.container(name)["Id"] for name in LONG_LIVED}
        subprocess.run(["docker", "start", ids["nginx"], ids["app"]], check=True, capture_output=True)
        time.sleep(5)
        subprocess.run(["docker", "start", ids["postgres"], ids["redis"]], check=True, capture_output=True)
        install.wait_for_health(200, within=120)
        assert {name: install.container(name)["State"]["StartedAt"] for name in ONE_SHOTS} == oneshots
        assert install.fingerprint() == held["fingerprint"]

    with subtests.test(msg="a copy is taken, proven, refused when damaged, and returned to"):
        same_images()
        copies = Path(tempfile.mkdtemp(prefix="ic-life-copy-"))
        try:
            copy = copies / "copy"
            taken = subprocess.run(["sh", str(BACKUP), "backup", str(copy)], env=install.env,
                                   capture_output=True, text=True, timeout=900)
            assert taken.returncode == 0, taken.stdout[-2000:] + taken.stderr[-2000:]

            def verify(copy_dir: Path) -> subprocess.CompletedProcess:
                return subprocess.run(["sh", str(BACKUP), "verify", str(copy_dir)], env=install.env,
                                      capture_output=True, text=True, timeout=900)

            def reseal(copy_dir: Path) -> None:
                """Record each part's digest as it now is, as a copy written that way would carry."""
                sealed = subprocess.run(["sha256sum", "db.dump", "evidence.tar", "shape"], cwd=copy_dir,
                                        capture_output=True, text=True, check=True).stdout
                (copy_dir / "SHA256SUMS").write_text(sealed)

            with tarfile.open(copy / "evidence.tar") as archive:
                artefact = next(member for member in archive if member.isfile())
            # Inside the artefact's bytes: cutting only the archive's padding damages nothing.
            middle = artefact.offset_data + artefact.size // 2
            for part, keep in (("db.dump", (copy / "db.dump").stat().st_size * 3 // 4),
                               ("evidence.tar", middle)):
                damaged = copies / f"damaged-{part}"
                shutil.copytree(copy, damaged)
                with open(damaged / part, "r+b") as file:
                    file.truncate(keep)
                reseal(damaged)
                assert verify(damaged).returncode != 0, f"a copy written with a truncated {part} verified"

            flipped = copies / "flipped"
            shutil.copytree(copy, flipped)
            with open(flipped / "evidence.tar", "r+b") as file:
                file.seek(middle)
                byte = file.read(1)
                file.seek(middle)
                file.write(bytes([byte[0] ^ 0xFF]))
            assert (flipped / "evidence.tar").stat().st_size == (copy / "evidence.tar").stat().st_size
            refused = verify(flipped)
            assert refused.returncode != 0, "a copy with one byte of an artefact changed verified"
            assert "evidence.tar" in refused.stderr, refused.stderr[-2000:]

            other = stack("-restored")
            other.must("up", "--no-start")
            other.capture.attach()
            other.must("up", "-d", "--wait")
            other.wait_for_health(200)

            elsewhere = copies / "elsewhere"
            shutil.copytree(copy, elsewhere)
            (elsewhere / "shape").write_text("0" * 32 + "\n")
            reseal(elsewhere)
            untouched = other.fingerprint()
            refused = subprocess.run(["sh", str(BACKUP), "restore", str(elsewhere)], env=other.env,
                                     capture_output=True, text=True, timeout=900)
            assert refused.returncode == 2, refused.stdout[-2000:] + refused.stderr[-2000:]
            assert other.fingerprint() == untouched

            returned = subprocess.run(["sh", str(BACKUP), "restore", str(copy)], env=other.env,
                                      capture_output=True, text=True, timeout=900)
            assert returned.returncode == 0, returned.stdout[-2000:] + returned.stderr[-2000:]
            other.wait_for_health(200)
            assert other.sql("select count(*) from session") == "0", "a restored copy carried sessions"
            restored = other.fingerprint()
            for key in ("files", "certificate"):
                restored.pop(key)
            assert restored == {key: value for key, value in held["fingerprint"].items()
                                if key not in ("files", "certificate")}
            answer = other.edge.request("POST", "/api/auth/sign-in/email",
                                        {"email": EMAIL, "password": PASSWORD})
            assert answer.status == 200, (answer.status, answer.body[:300])
            assert "kept through every phase" in [row["note"] for row in other.edge.request(
                "GET", f"/api/cases/{held['case']}/casenotes").json()]
            held["other"] = other
            census = other.edge.request("GET", "/api/settings").json()["storage"]["artefacts"]
            assert census == {"expected": 1, "missing": 0}, census

            # The install the copy came from, signed in afresh: its earlier session is held by
            # Postgres alone since the stores restarted, and this one by the session cache too.
            signed_in()
            assert install.edge.request("GET", "/api/cases").status == 200
            back = subprocess.run(["sh", str(BACKUP), "restore", str(copy)], env=install.env,
                                  capture_output=True, text=True, timeout=900)
            assert back.returncode == 0, back.stdout[-2000:] + back.stderr[-2000:]
            install.wait_for_health(200)
            assert install.edge.request("GET", "/api/cases").status == 401, "a session outlived the restore"
            assert install.fingerprint() == held["fingerprint"]
            signed_in()
        finally:
            shutil.rmtree(copies, ignore_errors=True)

    with subtests.test(msg="a shape that would lose data is refused, with or without a terminal"):
        same_images()
        install.sql("alter table library add column lc_gone text; "
                    "update library set lc_gone = 'still here' where builtin")
        kept = install.sql("select count(lc_gone) from library")
        try:
            with PolicyWatcher(install) as watcher:
                refused = install.compose("up", "-d")
            assert refused.returncode != 0, "a start that would drop a column holding data went ahead"
            assert "migrate" in refused.stdout + refused.stderr
            assert install.container("migrate")["State"]["ExitCode"] == 2
            said = install.must("logs", "migrate")
            assert "library" in said and "lc_gone" in said, said[-2000:]
            assert min(watcher.counts) == held["policies"], "the refused start dropped the policies meanwhile"
            typed = subprocess.run(terminal([*install.compose_argv(), "run", "--rm", "migrate"]),
                                   env=install.env, cwd=REPO_ROOT, capture_output=True, text=True,
                                   stdin=subprocess.DEVNULL, timeout=600)
            assert typed.returncode == 2, typed.stdout[-2000:] + typed.stderr[-2000:]
            assert "lc_gone" in typed.stdout + typed.stderr
            assert install.sql("select count(lc_gone) from library") == kept
            assert install.edge.health().status == 200
            assert "kept through every phase" in notes(held["case"])
        finally:
            install.sql("alter table library drop column if exists lc_gone")
            install.must("up", "-d", "--wait")

    with subtests.test(msg="nothing in the install reached outside it, preparation included"):
        # The step `migrate` is configured with, run again as npm's update check
        # would find it a day later.
        config = json.loads(install.must("config", "--format", "json"))["services"]["migrate"]
        install.must("run", "--rm", "--no-deps", "--entrypoint", "sh", "migrate", "-c",
                     'rm -f /root/.npm/_update-notifier-last-checked; exec "$@"', "sh",
                     *config["command"])
        time.sleep(2)
        sent = install.capture.packets() + (held["other"].capture.packets() if "other" in held else [])
        assert sent == [], "\n".join(sent)
