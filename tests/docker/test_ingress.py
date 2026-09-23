# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only

"""The shipped stack, named, reached by analysts on other machines. Opt-in: `INCIDENTCOMPANION_CONTAINER_TESTS=1`.

`compose.yaml` is brought up with `IC_NAME` set, as an operator would. Each
analyst is a container of the edge image on the stack's network, with its own
address, reaching the install the way a browser at `https://<name>:<port>`
does: SNI, `Host` and `Origin` all carry the name, and the certificate is
verified against the one the install minted.

**What this does not cover is the host's own forwarding.** Whether each LAN
caller reaches the edge with its own address depends on the engine publishing
the port (`openspec/specs/deployment/design.md`); here every analyst reaches
the edge across the compose network, which keeps it.
"""
from __future__ import annotations

import itertools
import json
import os
import subprocess
import uuid

import pytest

from tests._must_run import declined
from tests._repo import REPO_ROOT

pytestmark = pytest.mark.skipif(
    os.environ.get("INCIDENTCOMPANION_CONTAINER_TESTS", "") != "1",
    reason="opt-in: set INCIDENTCOMPANION_CONTAINER_TESTS=1 (builds and runs the stack)")

STACK = REPO_ROOT / "compose.yaml"
_WORKER = os.environ.get("PYTEST_XDIST_WORKER", "gw0")
PROJECT = f"incidentcompanion-ingress-test-{_WORKER}"
PORT = 18543 + int(_WORKER.removeprefix("gw"))
NAME = "ic.lan.test"
ORIGIN = f"https://{NAME}:{PORT}"
EDGE_IMAGE = "incidentcompanion-nginx:local"
ACCOUNT = "analyst@ic.lan.test"
PASSWORD = "an-analyst-password-long-enough"
_names = itertools.count()


def _compose(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(
        ["docker", "compose", "-p", PROJECT, "-f", str(STACK), *args],
        capture_output=True, text=True,
        env={**os.environ, "IC_STACK_PORT": str(PORT), "IC_NAME": NAME})
    if check:
        assert result.returncode == 0, f"compose {' '.join(args)}:\n{result.stderr[-3000:]}"
    return result


class Analyst:
    """A machine on the network, with its own address and a copy of the install's certificate."""

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

    def curl(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["docker", "exec", self.container, "curl", "-sS", "--max-time", "15", *args],
            capture_output=True, text=True)

    def at_the_name(self, path: str, *args: str) -> subprocess.CompletedProcess:
        """A request to the install at its name, verifying its certificate."""
        return self.curl("--connect-to", f"{NAME}:{PORT}:nginx:8443", "--cacert", "/ca/cert.pem",
                         *args, f"{ORIGIN}{path}")

    def status(self, path: str, *args: str) -> int:
        answer = self.at_the_name(path, "-o", "/dev/null", "-w", "%{http_code}", *args)
        return int(answer.stdout or 0)

    def sign_in(self, email: str, password: str) -> int:
        return self.status("/api/auth/sign-in/email", "-X", "POST",
                           "-H", "content-type: application/json", "-H", f"origin: {ORIGIN}",
                           "--data", json.dumps({"email": email, "password": password}))


@pytest.fixture(scope="module")
def install():
    """The shipped stack at `ic.lan.test`, with one account, torn down with every analyst."""
    if subprocess.run(["docker", "info"], capture_output=True).returncode != 0:
        declined("The ingress tier", "no Docker daemon is reachable")
    _compose("down", "-v", "--remove-orphans", check=False)
    try:
        _compose("up", "-d", "--build", "--wait")
        _compose("run", "--rm", "--no-deps", "-e", f"IC_DEV_EMAIL={ACCOUNT}",
                 "-e", f"IC_DEV_PASSWORD={PASSWORD}", "seed", "node", "dist/src/seed.js",
                 "--dev-account")
        yield
    finally:
        listed = subprocess.run(["docker", "ps", "-aq", "--filter", f"name={PROJECT}-"],
                                capture_output=True, text=True).stdout.split()
        if listed:
            subprocess.run(["docker", "rm", "-f", *listed], capture_output=True)
        _compose("down", "-v", "--remove-orphans", check=False)


def _audit(where: str) -> list[str]:
    """`ip_address` of every install audit line matching `where`, read in the store."""
    answer = _compose("exec", "-T", "postgres", "psql", "-U", "incidentcompanion",
                      "-d", "incidentcompanion", "-At", "-c",
                      f"select coalesce(ip_address, '') from install_activity where {where}")
    return answer.stdout.split()


def _session_addresses(email: str) -> list[str]:
    answer = _compose("exec", "-T", "postgres", "psql", "-U", "incidentcompanion",
                      "-d", "incidentcompanion", "-At", "-c",
                      "select coalesce(s.ip_address, '') from session s join \"user\" u "
                      f"on u.id = s.user_id where u.email = '{email}' order by s.created_at")
    return answer.stdout.split()


def _guess() -> str:
    """An account nobody holds, so guessing at it locks nothing."""
    return f"nobody-{uuid.uuid4().hex[:12]}@ic.lan.test"


def test_an_analyst_elsewhere_reaches_the_install_at_its_name(install):
    """The name is served, certified, told to stay protected once, and is the only destination named."""
    analyst = Analyst("elsewhere")
    answer = analyst.at_the_name("/api/health", "-D", "-", "-o", "/dev/null")
    assert answer.returncode == 0, (
        f"the install at its name did not verify against its own certificate: {answer.stderr}")

    head = answer.stdout.lower().splitlines()
    assert head[0].split()[1] == "200", head[0]
    hsts = [line for line in head if line.startswith("strict-transport-security:")]
    assert hsts == ["strict-transport-security: max-age=31536000"], (
        f"a named install should be told to stay protected exactly once: {hsts}")

    [policy] = [line for line in head if line.startswith("content-security-policy:")]
    connect = next(part.split()[1:] for part in policy.split(":", 1)[1].split(";")
                   if part.split() and part.split()[0] == "connect-src")
    assert connect == ["'self'", f"wss://{NAME}:{PORT}"], (
        f"the page may connect somewhere other than the install: {connect}")


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1", "nginx", "other.lan.test"])
def test_a_named_install_answers_no_other_name(install, host):
    """A named install answers at its name alone; any other name is closed unanswered."""
    analyst = Analyst("rebinder")
    answer = analyst.curl("-k", "--connect-to", f"{host}:{PORT}:nginx:8443",
                          "-o", "/dev/null", "-w", "%{http_code}", f"https://{host}:{PORT}/api/health")
    assert answer.stdout in ("", "000"), f"{host} was answered {answer.stdout}"
    assert answer.returncode != 0, f"{host} was answered rather than closed"


def test_two_analysts_are_limited_separately_and_recorded_as_themselves(install):
    """One analyst guessing is refused; another, at once, signs in, and each is recorded at their own address."""
    guesser, holder = Analyst("guesser"), Analyst("holder")
    guessed = [_guess() for _ in range(6)]

    answers = [guesser.sign_in(account, "not-the-password-at-all") for account in guessed]
    assert answers[:5] == [401] * 5 and answers[5] == 429, answers
    assert holder.sign_in(ACCOUNT, PASSWORD) == 200, (
        "one analyst's guessing refused another analyst's sign-in")

    recorded = _audit("event = 'sign_in_failed' and detail->>'account' in ("
                      + ", ".join(f"'{account}'" for account in guessed[:5]) + ")")
    assert recorded == [guesser.address] * 5, (
        f"the guesser at {guesser.address} was recorded as {recorded}")
    assert _session_addresses(ACCOUNT)[-1] == holder.address


def test_the_install_believes_an_address_only_from_its_edge(install):
    """A container calling the application directly is attributed to itself, whatever it claims."""
    forger = Analyst("forger")
    direct = "http://app:8080/api/auth/sign-in/email"

    def forged(n: int, email: str, password: str) -> int:
        answer = forger.curl("-o", "/dev/null", "-w", "%{http_code}", "-X", "POST", direct,
                             "-H", "content-type: application/json",
                             "-H", f"x-forwarded-for: 10.66.0.{n}", "-H", f"x-real-ip: 10.66.1.{n}",
                             "--data", json.dumps({"email": email, "password": password}))
        return int(answer.stdout or 0)

    assert forged(1, ACCOUNT, PASSWORD) == 200
    guessed = [_guess() for _ in range(5)]
    answers = [forged(n, account, "not-the-password-at-all")
               for n, account in enumerate(guessed, start=2)]
    assert answers[:4] == [401] * 4 and answers[4] == 429, (
        f"each presented address bought a fresh budget: {answers}")

    recorded = _audit("event = 'sign_in_failed' and detail->>'account' in ("
                      + ", ".join(f"'{account}'" for account in guessed[:4]) + ")")
    assert recorded == [forger.address] * 4, (
        f"the forger at {forger.address} wrote {recorded} into the audit")
    assert _session_addresses(ACCOUNT)[-1] == forger.address


@pytest.mark.parametrize("origin,own", [
    (ORIGIN, True),
    (f"http://{NAME}:{PORT}", False),
    (f"https://{NAME}:{PORT + 1}", False),
    (f"https://localhost:{PORT}", False),
])
def test_the_install_answers_only_to_its_own_origin(install, origin, own):
    """A sign-in and a socket are admitted by the same origins: the install's own, and no other spelling.

    No cookie and no account: 401 is past the origin check, 403 is refused by it.
    """
    analyst = Analyst("origin")
    expected = 401 if own else 403
    assert analyst.status(
        "/api/cases/00000000-0000-4000-8000-000000000000/live", "--http1.1",
        "-H", "Connection: Upgrade", "-H", "Upgrade: websocket",
        "-H", "Sec-WebSocket-Version: 13", "-H", "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        "-H", f"Origin: {origin}") == expected, "the socket"
    assert analyst.status("/api/auth/sign-in/email", "-X", "POST",
                          "-H", "content-type: application/json", "-H", f"origin: {origin}",
                          "--data", json.dumps({"email": _guess(), "password": "not-it-at-all"})
                          ) == expected, "the sign-in"


def test_a_page_elsewhere_spends_nothing_of_the_analyst_s_budget(install):
    """A cross-site sign-in is refused at the edge before either limiter counts it."""
    analyst = Analyst("visitor")
    refused = [analyst.status("/api/auth/sign-in/email", "-X", "POST",
                              "-H", "content-type: text/plain", "-H", "origin: https://evil.test",
                              "--data", "{}")
               for _ in range(25)]
    assert refused == [403] * 25, refused
    assert analyst.sign_in(_guess(), "not-the-password-at-all") == 401, (
        "a page the analyst visited spent their sign-in budget")
