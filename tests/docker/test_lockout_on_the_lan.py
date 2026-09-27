# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only

"""The account lockout on the shipped stack, guessed at from machines on its network. Opt-in: `INCIDENTCOMPANION_CONTAINER_TESTS=1`.

Each machine is a container of the edge image on the stack's network, with its
own address, signing in through the edge as a browser at the install would.
Every machine stays inside the per-address sign-in limit, so what refuses it is
the lock and not the limit; the install's threshold is lowered by its
administrator so one machine can reach it.
"""
from __future__ import annotations

import itertools
import json
import os
import subprocess
import uuid

import pytest

from tests import _checkout as checkout
from tests._must_run import declined
from tests._repo import REPO_ROOT

pytestmark = pytest.mark.skipif(
    os.environ.get("INCIDENTCOMPANION_CONTAINER_TESTS", "") != "1",
    reason="opt-in: set INCIDENTCOMPANION_CONTAINER_TESTS=1 (builds and runs the stack)")

STACK = REPO_ROOT / "compose.yaml"
PROJECT = checkout.project("lockout")
PORT = checkout.port("lockout")
ORIGIN = f"https://localhost:{PORT}"
EDGE_IMAGE = checkout.image("nginx")
ADMIN = "admin@lockout.test"
PASSWORD = "the-holders-own-password"
THRESHOLD = 4
FIRST_LOCK = 5
_names = itertools.count()


def _compose(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(
        ["docker", "compose", "-p", PROJECT, "-f", str(STACK), *args],
        capture_output=True, text=True, env={**os.environ, **checkout.ENV, "IC_STACK_PORT": str(PORT)})
    if check:
        assert result.returncode == 0, f"compose {' '.join(args)}:\n{result.stderr[-3000:]}"
    return result


class Machine:
    """A machine on the network, with its own address and its own cookie jar."""

    def __init__(self, label: str):
        self.container = f"{PROJECT}-{label}-{next(_names)}"
        started = subprocess.run(
            ["docker", "run", "-d", "--name", self.container, "--network", f"{PROJECT}_default",
             "-v", f"{PROJECT}_ic-tls:/ca:ro", "--entrypoint", "sleep", EDGE_IMAGE, "infinity"],
            capture_output=True, text=True)
        assert started.returncode == 0, started.stderr
        self.address = subprocess.run(
            ["docker", "inspect", "-f", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
             self.container], capture_output=True, text=True, check=True).stdout.strip()

    def request(self, method: str, path: str, body: dict) -> int:
        """One request to the install through its edge, verifying its certificate; the status."""
        answer = subprocess.run(
            ["docker", "exec", self.container, "curl", "-sS", "--max-time", "15",
             "--connect-to", f"localhost:{PORT}:nginx:8443", "--cacert", "/ca/cert.pem",
             "-c", "/tmp/jar", "-b", "/tmp/jar", "-o", "/dev/null", "-w", "%{http_code}",
             "-X", method, "-H", "content-type: application/json", "-H", f"origin: {ORIGIN}",
             "--data", json.dumps(body), f"{ORIGIN}{path}"],
            capture_output=True, text=True)
        assert answer.returncode == 0, answer.stderr
        return int(answer.stdout)

    def sign_in(self, email: str, password: str) -> int:
        return self.request("POST", "/api/auth/sign-in/email", {"email": email, "password": password})

    def guess(self, email: str, times: int) -> None:
        """`times` distinct wrong passwords, each refused as wrong rather than limited."""
        answers = [self.sign_in(email, f"wrong-{uuid.uuid4()}") for _ in range(times)]
        assert answers == [401] * times, answers


def _sql(statement: str) -> list[str]:
    answer = _compose("exec", "-T", "postgres", "psql", "-U", "incidentcompanion",
                      "-d", "incidentcompanion", "-At", "-c", statement)
    return answer.stdout.split()


@pytest.fixture(scope="module")
def administrator():
    """The shipped stack, its administrator signed in from a machine of their own, the lock tightened."""
    if subprocess.run(["docker", "info"], capture_output=True).returncode != 0:
        declined("The lockout tier", "no Docker daemon is reachable")
    _compose("down", "-v", "--remove-orphans", check=False)
    try:
        _compose("up", "-d", "--build", "--wait")
        _compose("run", "--rm", "--no-deps", "-e", f"IC_DEV_EMAIL={ADMIN}",
                 "-e", f"IC_DEV_PASSWORD={PASSWORD}", "seed", "node", "dist/src/seed.js",
                 "--dev-account")
        admin = Machine("admin")
        assert admin.sign_in(ADMIN, PASSWORD) == 200
        for key, value in (("auth.lockoutAfterFailures", THRESHOLD),
                           ("auth.lockoutMinutes", FIRST_LOCK),
                           ("auth.lockoutMaxMinutes", 4 * FIRST_LOCK)):
            assert admin.request("PUT", "/api/install/policy", {"key": key, "value": value}) == 200
        yield admin
    finally:
        listed = subprocess.run(["docker", "ps", "-aq", "--filter", f"name={PROJECT}-"],
                                capture_output=True, text=True).stdout.split()
        if listed:
            subprocess.run(["docker", "rm", "-f", *listed], capture_output=True)
        _compose("down", "-v", "--remove-orphans", check=False)


@pytest.fixture
def analyst(administrator):
    """A fresh analyst's address, their password being `PASSWORD`."""
    email = f"analyst-{uuid.uuid4().hex[:10]}@lockout.test"
    made = administrator.request("POST", "/api/accounts", {
        "username": email, "displayName": "Analyst", "password": PASSWORD, "role": "analyst"})
    assert made in (200, 201), made
    return email


def test_one_machine_guessing_leaves_the_analyst_signing_in_from_their_own(analyst):
    """A machine guessing at an analyst's account is locked out; the analyst at their own machine is not."""
    own, guesser = Machine("own"), Machine("guesser")
    assert own.sign_in(analyst, PASSWORD) == 200

    guesser.guess(analyst, THRESHOLD)

    assert guesser.sign_in(analyst, PASSWORD) == 401, "the guessing machine was not locked out"
    assert own.sign_in(analyst, PASSWORD) == 200, (
        "another machine's guessing locked the analyst out of their own")
    locked = _sql("select ip_address from install_activity where event = 'account_locked' "
                  f"and target_label = '{analyst}'")
    assert locked == [guesser.address], f"the lock was recorded against {locked}"


def test_guesses_spread_across_machines_lock_every_machine_the_account_does_not_know(analyst):
    """Machines each under the threshold lock out every unfamiliar one together, and never the analyst's own."""
    own = Machine("own")
    assert own.sign_in(analyst, PASSWORD) == 200

    for label in ("spread-a", "spread-b", "spread-c", "spread-d"):
        Machine(label).guess(analyst, THRESHOLD // 4)

    assert Machine("bystander").sign_in(analyst, PASSWORD) == 401, (
        "a machine that never guessed signed in while the guessing was locked out")
    assert own.sign_in(analyst, PASSWORD) == 200, "the analyst was locked out of their own machine"


def test_the_same_wrong_password_counts_once(analyst):
    """One wrong password offered as many times as the threshold leaves the account open."""
    retrying = Machine("retrying")
    answers = [retrying.sign_in(analyst, "a-stale-password-kept-by-a-client") for _ in range(THRESHOLD)]
    assert answers == [401] * THRESHOLD, answers

    assert retrying.sign_in(analyst, PASSWORD) == 200, "one wrong password repeated locked the account"


def test_a_lock_that_follows_another_lasts_longer(analyst):
    """The second lock of a run, with no right password between, lasts twice the first."""
    Machine("first").guess(analyst, THRESHOLD)
    _sql("update sign_in_lockout set locked_until = now() - interval '1 second' "
         f"where user_id = (select id from \"user\" where email = '{analyst}')")

    Machine("second").guess(analyst, THRESHOLD)

    minutes = _sql("select detail->>'minutes' from install_activity where event = 'account_locked' "
                   f"and target_label = '{analyst}' order by seq")
    assert minutes == [str(FIRST_LOCK), str(2 * FIRST_LOCK)], minutes
