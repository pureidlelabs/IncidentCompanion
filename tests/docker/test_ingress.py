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
import re
import subprocess
import time
import uuid

import pytest

from tests import posix_modes
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

    def statuses(self, path: str, count: int, *args: str) -> list[int]:
        """`count` requests in one connection, each answer's status in order."""
        answer = self.at_the_name(f"{path}?n=[1-{count}]", "-o", "/dev/null",
                                  "-w", "%{http_code}\\n", *args)
        return [int(code) for code in answer.stdout.split()]

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


@pytest.fixture(autouse=True)
def _through_the_entry_point(record_property):
    """Every case here reaches the shipped stack through its edge, which `tests/certify.py` reads."""
    record_property("entry", "compose")


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


#: Named rather than spelled, because the port differs per xdist worker and a
#: parameter id that differs between workers is refused at collection.
_ORIGINS = {
    "its own": (ORIGIN, True),
    "unprotected": (f"http://{NAME}:{PORT}", False),
    "another port": (f"https://{NAME}:{PORT + 1}", False),
    "loopback": (f"https://localhost:{PORT}", False),
}


@pytest.mark.parametrize("spelling", sorted(_ORIGINS))
def test_the_install_answers_only_to_its_own_origin(install, spelling):
    """A sign-in and a socket are admitted by the same origins: the install's own, and no other spelling.

    No cookie and no account: 401 is past the origin check, 403 is refused by it.
    """
    origin, own = _ORIGINS[spelling]
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


#: What Chromium sends when another site's page fetches from the install and
#: when it draws an image from it: the fetch carries that page's origin, the
#: image carries none.
_FETCHED = ("-H", "origin: https://evil.test", "-H", "sec-fetch-site: cross-site",
            "-H", "sec-fetch-mode: cors", "-H", "sec-fetch-dest: empty")
_DRAWN = ("-H", "sec-fetch-site: cross-site", "-H", "sec-fetch-mode: no-cors",
          "-H", "sec-fetch-dest: image")


def test_a_page_elsewhere_spends_nothing_the_analyst_asks_for(install):
    """Another site's requests through the analyst's browser are refused before any limit counts them.

    Thirteen rounds of 24, each inside a second, pass the application's 300 a
    minute without tripping its 25 a second. A link from that site still opens
    the install.
    """
    analyst = Analyst("browsing")
    answers: list[int] = []
    for _ in range(13):
        answers += analyst.statuses("/api/health", 12, *_FETCHED)
        answers += analyst.statuses("/api/health", 12, *_DRAWN)
        time.sleep(1)
    assert analyst.status("/api/health", "-H", "sec-fetch-site: same-origin",
                          "-H", "sec-fetch-mode: cors", "-H", "sec-fetch-dest: empty") == 200, (
        "a page the analyst visited spent the analyst's own budget")
    assert set(answers) == {403}, (
        f"another site's requests were answered: {sorted(set(answers))}, {answers.count(429)} refused as too many")
    assert analyst.status("/", "-H", "sec-fetch-site: cross-site", "-H", "sec-fetch-mode: navigate",
                          "-H", "sec-fetch-dest: document") == 200, "a link from another site was refused"


def test_an_edge_started_after_the_application_is_believed_from_its_first_request(install):
    """An application that booted before its edge records each caller as itself at once.

    The edge is waited for by a name it closes, so nothing reaches the
    application before the analysts do. A door that finds the edge only on a
    timer passes whenever its timer fires during the edge's own start-up;
    `server/src/wire/an-edge-started-late-is-believed.test.ts` decides when.
    """
    _compose("stop", "nginx")
    _compose("restart", "app")
    _compose("up", "-d", "--no-deps", "--wait", "app")
    first, second = Analyst("early"), Analyst("early")
    _compose("start", "nginx")
    for _ in range(100):
        closed = first.curl("-k", "--connect-to", f"other.lan.test:{PORT}:nginx:8443",
                            f"https://other.lan.test:{PORT}/")
        if closed.returncode not in (6, 7):  # resolved and connected, then closed
            break
        time.sleep(0.1)
    else:
        pytest.fail(f"the edge never came up: {closed.stderr}")

    guessed = [_guess(), _guess()]
    assert [first.sign_in(guessed[0], "not-the-password-at-all"),
            second.sign_in(guessed[1], "not-the-password-at-all")] == [401, 401]
    recorded = [_audit(f"event = 'sign_in_failed' and detail->>'account' = '{account}'")
                for account in guessed]
    assert recorded == [[first.address], [second.address]], (
        f"{first.address} and {second.address} were recorded as {recorded}")


def _answer(analyst: Analyst, *args: str) -> tuple[int, dict[str, list[str]], str]:
    """Status, headers by lower-cased name, and body of one response, as curl `-i` prints it."""
    printed = analyst.curl("-i", *args).stdout
    head, _, body = printed.replace("\r\n", "\n").partition("\n\n")
    lines = head.splitlines()
    headers: dict[str, list[str]] = {}
    for line in lines[1:]:
        name, _, value = line.partition(":")
        headers.setdefault(name.strip().lower(), []).append(value.strip())
    return int(lines[0].split()[1]) if lines else 0, headers, body


def _at_the_name(path: str, *args: str) -> tuple[str, ...]:
    return ("--connect-to", f"{NAME}:{PORT}:nginx:8443", "--cacert", "/ca/cert.pem",
            *args, f"{ORIGIN}{path}")


def _assert_the_browser_is_told(what: str, answer) -> None:
    status, headers, body = answer
    policies = headers.get("content-security-policy", [])
    assert len(policies) == 1, f"{what} ({status}) carries {len(policies)} content policies: {policies}"
    assert "frame-ancestors 'none'" in policies[0], f"{what} ({status}) may be framed: {policies[0]}"
    assert headers.get("x-content-type-options") == ["nosniff"], (
        f"{what} ({status}) lets the browser guess what it was sent: {headers}")
    assert headers.get("server", ["nginx"]) == ["nginx"], (
        f"{what} ({status}) names the build that served it: {headers.get('server')}")
    assert "nginx/" not in body, f"{what} ({status}) names the build in its body"


#: Each answer the edge writes itself, the status it is, and how a caller provokes it.
#: `--http1.1` where HTTP/2 would end the stream instead of answering.
_EDGE_ANSWERS = {
    "a foreign origin": (403, ("/api/health", "-H", "origin: https://evil.test")),
    "a body past the limit": (413, ("/api/cases", "--http1.1", "-X", "POST",
                                    "-H", "content-length: 600000000", "--data", "x")),
    "a path above the root": (400, ("/..%2f..%2fetc%2fpasswd", "--path-as-is")),
    "a header too large": (400, ("/api/health", "--http1.1", "-H", "cookie: " + "a" * 40000)),
}


def _refused_in_a_burst(analyst: Analyst, path: str, count: int):
    """The first 429 the edge itself wrote among `count` requests in one connection.

    Read inside the burst: a request after it can reach the application's own
    limiter, whose 429 is JSON and carries the application's policy.
    """
    printed = analyst.curl("-i", *_at_the_name(f"{path}?n=[1-{count}]")).stdout
    for one in re.split(r"(?m)^(?=HTTP/\d)", printed.replace("\r\n", "\n")):
        head, _, body = one.partition("\n\n")
        lines = head.splitlines()
        if not lines or lines[0].split()[1:2] != ["429"]:
            continue
        headers: dict[str, list[str]] = {}
        for line in lines[1:]:
            name, _, value = line.partition(":")
            headers.setdefault(name.strip().lower(), []).append(value.strip())
        if headers.get("content-type") == ["text/html"]:
            return 429, headers, body
    pytest.fail(f"the edge refused nothing of {count} requests to {path}")


def test_an_answer_the_edge_writes_itself_is_read_under_a_policy(install):
    """Each status the edge writes without the application carries a policy, nosniff and no build."""
    analyst = Analyst("edge")
    answers = {what: _answer(analyst, *_at_the_name(*probe))
               for what, (_, probe) in _EDGE_ANSWERS.items()}
    answers["plain HTTP at the protected port"] = _answer(
        analyst, "--connect-to", f"{NAME}:{PORT}:nginx:8443", f"http://{NAME}:{PORT}/")
    answers["too many at the credential paths"] = _refused_in_a_burst(
        analyst, "/api/auth/not-a-real-route", 25)
    answers["too many elsewhere"] = _refused_in_a_burst(analyst, "/not-a-real-route", 150)

    expected = {what: status for what, (status, _) in _EDGE_ANSWERS.items()} | {
        "plain HTTP at the protected port": 400,
        "too many at the credential paths": 429,
        "too many elsewhere": 429,
    }
    assert {what: answer[0] for what, answer in answers.items()} == expected, (
        "a probe no longer provokes the answer it names, so it asserts nothing about it")
    for what, answer in answers.items():
        _assert_the_browser_is_told(what, answer)


def test_an_answer_the_edge_writes_while_the_application_is_down_is_read_under_a_policy(install):
    """The edge's own 502 or 504, answered within ten seconds, with nothing behind it to write a policy.

    Which of the two depends on whether the edge still holds the stopped
    container's address; either way the edge answers rather than holding the caller.
    """
    analyst = Analyst("down")
    _compose("stop", "app")
    try:
        started = time.monotonic()
        answer = _answer(analyst, *_at_the_name("/api/health", "--max-time", "15"))
        waited = time.monotonic() - started
    finally:
        _compose("up", "-d", "--no-deps", "--wait", "app")
    assert answer[0] in (502, 504), f"the edge answered {answer[0]} after {waited:.1f}s"
    assert waited < 10, f"the edge held the caller {waited:.1f}s before answering"
    _assert_the_browser_is_told("the application down", answer)


def test_a_page_and_an_answer_from_the_interface_carry_one_policy_through_the_edge(install):
    """The application's own policy reaches the browser once, unchanged by the edge, on both."""
    analyst = Analyst("reader")
    page = _answer(analyst, *_at_the_name("/"))
    api = _answer(analyst, *_at_the_name("/api/health"))
    assert (page[0], api[0]) == (200, 200)
    for what, answer in (("the page", page), ("the interface", api)):
        _assert_the_browser_is_told(what, answer)
    assert page[1]["content-security-policy"] == api[1]["content-security-policy"]
    assert "wss://" in api[1]["content-security-policy"][0], (
        "the edge's policy replaced the application's")


def _handshake(analyst: Analyst, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["docker", "exec", analyst.container, "openssl", "s_client", "-connect", "nginx:8443",
         "-servername", NAME, *args], capture_output=True, text=True, timeout=30)


@pytest.mark.parametrize("suite", ["AES128-SHA", "AES256-SHA", "AES128-SHA256", "AES256-SHA256",
                                   "AES128-GCM-SHA256", "ECDHE-RSA-AES256-SHA",
                                   "ECDHE-RSA-AES128-SHA256"])
def test_a_client_offering_only_a_weak_suite_is_refused(install, suite):
    """No forward secrecy, or no AEAD: nothing under TLS 1.2 agrees to it."""
    # `@SECLEVEL=0`, or the client withdraws the suite itself and the refusal is its own.
    answer = _handshake(Analyst("weak"), "-tls1_2", "-cipher", f"{suite}:@SECLEVEL=0")
    assert answer.returncode != 0, f"the edge agreed {suite}:\n{answer.stdout[-800:]}"


@pytest.mark.parametrize("version,suite", [("-tls1_2", "ECDHE-RSA-AES128-GCM-SHA256"),
                                           ("-tls1_2", "ECDHE-RSA-CHACHA20-POLY1305"),
                                           ("-tls1_3", None)])
def test_a_client_offering_a_forward_secret_aead_suite_is_served(install, version, suite):
    """The half that shows the refusals above are a policy rather than a broken listener."""
    answer = _handshake(Analyst("strong"), version, *(["-cipher", suite] if suite else []))
    assert answer.returncode == 0, answer.stderr[-800:]
    protocol = "TLSv1.2" if version == "-tls1_2" else "TLSv1.3"
    assert protocol in answer.stdout and (suite or "TLS_AES") in answer.stdout, answer.stdout[-800:]


def _session_read(analyst: Analyst) -> int:
    return analyst.status("/api/auth/get-session", "-H", f"origin: {ORIGIN}")


def test_an_address_reading_its_sessions_still_signs_in(install):
    """Analysts at one address keep their sessions alive, and a colleague there signs in."""
    office = Analyst("office")
    reads = [_session_read(office) for _ in range(25)]
    assert set(reads) == {200}, f"the edge refused an analyst's own session read: {reads}"
    assert office.sign_in(ACCOUNT, PASSWORD) == 200, (
        "session reads at this address spent its sign-in budget")


def test_guessing_at_an_address_leaves_its_analysts_reporting_in(install):
    """A burst of sign-ins at one address, and the analyst there still reports activity."""
    office = Analyst("sprayed")
    guesses = office.statuses("/api/auth/not-a-real-route", 40, "-H", f"origin: {ORIGIN}")
    assert 429 in guesses, f"the burst never reached the sign-in limit: {guesses}"
    assert _session_read(office) == 200, (
        "sign-in attempts at this address refused its analyst's activity report")


@pytest.mark.parametrize("destination", ["new", "open"])
def test_a_copy_is_readable_only_by_whoever_took_it(install, tmp_path, destination):
    """`backup.sh backup` against the running stack, and the modes of what it wrote, host side.

    `open` is a directory left world-readable, holding a world-readable
    part from an earlier copy, which the new copy writes over.
    """
    copy = tmp_path / "copy"
    if destination == "open":
        copy.mkdir()
        copy.chmod(0o755)
        (copy / "db.dump").write_text("an earlier copy")
        (copy / "db.dump").chmod(0o644)
    taken = subprocess.run(
        ["sh", str(REPO_ROOT / "docker" / "backup.sh"), "backup", str(copy)],
        capture_output=True, text=True, timeout=600,
        env={**os.environ, "IC_STACK_PROJECT": PROJECT, "IC_STACK_PORT": str(PORT), "IC_NAME": NAME})
    assert taken.returncode == 0, taken.stdout[-2000:] + taken.stderr[-2000:]
    posix_modes.assert_owner_only(copy, directory=True)
    for part in ("db.dump", "evidence.tar", "shape", "SHA256SUMS"):
        posix_modes.assert_owner_only(copy / part)
