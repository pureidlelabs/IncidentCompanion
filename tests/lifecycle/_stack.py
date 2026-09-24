"""The shipped `compose.yaml`, driven as an operator drives it, under a project of its own.

No override file and no second topology: the only inputs are the `.env`
`docker/secrets.sh` writes, `IC_STACK_PROJECT` and `IC_STACK_PORT`, which are
the variables `compose.yaml` itself reads.
"""

from __future__ import annotations

import hashlib
import http.client
import json
import os
import re
import signal
import socket
import ssl
import subprocess
import threading
import time
from dataclasses import dataclass, field

from tests._repo import REPO_ROOT

COMPOSE = REPO_ROOT / "compose.yaml"

#: The edge mints its own certificate; this client proves TLS is served, not who serves it.
UNVERIFIED = ssl._create_unverified_context()

#: Rows the install is expected to rewrite while it runs, or to hold per sign-in.
EPHEMERAL = ("session", "verification", "install_activity")

#: Every table's rows as one digest each, read as the superuser past every policy.
TABLES_SQL = """
select coalesce(string_agg(relname || '=' || (xpath('/row/h/text()', query_to_xml(format(
  'select md5(coalesce(string_agg(t::text, %L order by t::text), %L)) as h from %I.%I t',
  '|', '', schemaname, relname), false, true, '')))[1]::text, ',' order by relname), '')
from pg_stat_user_tables where schemaname = 'public' and relname not in ({excluded})
"""

POLICIES_SQL = """
select count(*) || ':' || md5(coalesce(string_agg(tablename || policyname || cmd || roles::text
  || coalesce(qual, '') || coalesce(with_check, ''), ',' order by tablename, policyname), ''))
from pg_policies where schemaname = 'public'
"""

#: A capture container in the daemon's own network namespace, which holds every
#: project's bridge. Pinned, because what it runs is part of the evidence.
CAPTURE_IMAGE = "alpine@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6"


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


@dataclass
class Answer:
    status: int
    body: bytes
    headers: dict[str, str]

    def json(self):
        return json.loads(self.body or b"null")


@dataclass
class Edge:
    """HTTPS to the one published port, holding cookies as a browser would."""

    port: int
    cookies: dict[str, str] = field(default_factory=dict)

    @property
    def origin(self) -> str:
        return f"https://localhost:{self.port}"

    def request(self, method: str, path: str, body=None, headers: dict | None = None,
                cookies: bool = True, timeout: float = 10) -> Answer:
        sent = {"origin": self.origin, **(headers or {})}
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
            sent.setdefault("content-type", "application/json")
        if cookies and self.cookies:
            sent["cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        connection = http.client.HTTPSConnection("localhost", self.port, context=UNVERIFIED,
                                                 timeout=timeout)
        try:
            connection.request(method, path, body=body, headers=sent)
            response = connection.getresponse()
            payload = response.read()
            for header, value in response.getheaders():
                if header.lower() == "set-cookie":
                    name, _, rest = value.partition("=")
                    self.cookies[name.strip()] = rest.split(";", 1)[0]
            return Answer(response.status, payload, {k.lower(): v for k, v in response.getheaders()})
        finally:
            connection.close()

    def health(self) -> Answer | None:
        """`/api/health` without a cookie, or None when nothing answers at all."""
        try:
            return self.request("GET", "/api/health", cookies=False, timeout=5)
        except (OSError, http.client.HTTPException):
            return None

    def certificate(self) -> str:
        pem = ssl.get_server_certificate(("localhost", self.port))
        return hashlib.sha256(ssl.PEM_cert_to_DER_cert(pem)).hexdigest()


class PolicyWatcher:
    """Reads the policy count as a separate session sees it, as fast as one session can."""

    def __init__(self, stack: "Stack"):
        self.stack = stack
        self.counts: list[int] = []
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def __enter__(self) -> "PolicyWatcher":
        self._process = subprocess.Popen(
            [*self.stack.compose_argv(), "exec", "-T", "postgres", "psql", "-qtAX",
             "-U", "incidentcompanion", "-d", "incidentcompanion"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, env=self.stack.env, cwd=REPO_ROOT, bufsize=1)
        self._thread = threading.Thread(target=self._watch, daemon=True)
        self._thread.start()
        return self

    def _watch(self) -> None:
        query = "select count(*) from pg_policies where schemaname = 'public';\n"
        while not self._stop.is_set():
            self._process.stdin.write(query)
            self._process.stdin.flush()
            line = self._process.stdout.readline()
            if not line:
                return
            self.counts.append(int(line.strip()))

    def __exit__(self, *exc) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=10)
        self._process.kill()
        self._process.wait()


class Capture:
    """Every TCP SYN and UDP datagram leaving the project's network for anywhere else."""

    def __init__(self, stack: "Stack"):
        self.stack = stack
        self.sessions: dict[str, str] = {}

    def attach(self) -> None:
        """Start capturing on the project's current bridge, if not already."""
        network = self.stack.network()
        if network["Id"] in self.sessions:
            return
        subnet = network["IPAM"]["Config"][0]["Subnet"]
        name = f"{self.stack.project}-capture-{len(self.sessions)}"
        wanted = (f"src net {subnet} and not dst net {subnet} and "
                  "(udp or (tcp[tcpflags] & tcp-syn != 0))")
        subprocess.run(
            ["docker", "run", "-d", "--name", name, "--network", "host",
             "--cap-add", "NET_RAW", "--cap-add", "NET_ADMIN", CAPTURE_IMAGE, "sh", "-c",
             f"apk add --no-cache tcpdump >/dev/null && exec tcpdump -l -nn -i br-{network['Id'][:12]} '{wanted}'"],
            check=True, capture_output=True, text=True)
        deadline = time.monotonic() + 120
        while "listening on" not in self.logs(name):
            assert time.monotonic() < deadline, f"the capture never started:\n{self.logs(name)}"
            time.sleep(0.5)
        self.sessions[network["Id"]] = name

    @staticmethod
    def logs(name: str) -> str:
        done = subprocess.run(["docker", "logs", name], capture_output=True, text=True)
        return done.stdout + done.stderr

    def packets(self) -> list[str]:
        """Every packet captured so far, one line each."""
        return [line for name in self.sessions.values()
                for line in subprocess.run(["docker", "logs", name], capture_output=True,
                                           text=True).stdout.splitlines() if line.strip()]

    def close(self) -> None:
        for name in self.sessions.values():
            subprocess.run(["docker", "rm", "-f", name], capture_output=True)


class Stack:
    """One install of the shipped `compose.yaml`, under its own project and port."""

    def __init__(self, project: str):
        self.project = project
        self.port = free_port()
        self.edge = Edge(self.port)
        self.env = {**os.environ, "IC_STACK_PROJECT": project, "IC_STACK_PORT": str(self.port)}
        self.capture = Capture(self)

    def compose_argv(self) -> list[str]:
        return ["docker", "compose", "-f", str(COMPOSE)]

    def compose(self, *argv: str, timeout: float = 900) -> subprocess.CompletedProcess:
        return subprocess.run([*self.compose_argv(), *argv], env=self.env, cwd=REPO_ROOT,
                              capture_output=True, text=True, timeout=timeout)

    def must(self, *argv: str, timeout: float = 900) -> str:
        done = self.compose(*argv, timeout=timeout)
        assert done.returncode == 0, f"`docker compose {' '.join(argv)}` exited {done.returncode}:\n{done.stdout[-3000:]}\n{done.stderr[-3000:]}"
        return done.stdout

    def container(self, service: str) -> dict:
        ids = self.must("ps", "-a", "-q", service).split()
        assert ids, f"{service} has no container"
        inspected = subprocess.run(["docker", "inspect", ids[0]], capture_output=True, text=True,
                                   check=True)
        return json.loads(inspected.stdout)[0]

    def network(self) -> dict:
        found = subprocess.run(
            ["docker", "network", "inspect", f"{self.project}_default"],
            capture_output=True, text=True, check=True)
        return json.loads(found.stdout)[0]

    def sql(self, statement: str) -> str:
        return self.must("exec", "-T", "postgres", "psql", "-qtAX", "-v", "ON_ERROR_STOP=1",
                         "-U", "incidentcompanion", "-d", "incidentcompanion", "-c",
                         statement).strip()

    def fingerprint(self) -> dict[str, str]:
        """What must outlive every phase: rows, policies, evidence, identity and certificate."""
        excluded = ", ".join(f"'{name}'" for name in EPHEMERAL)
        tables = dict(pair.split("=", 1) for pair in
                      self.sql(TABLES_SQL.format(excluded=excluded)).split(",") if pair)
        files = self.must("exec", "-T", "app", "sh", "-c",
                          "cd /evidence && find . -type f | sort | xargs -r sha256sum; "
                          "sha256sum /install/secret")
        return {**{f"table {name}": digest for name, digest in tables.items()},
                "policies": self.sql(POLICIES_SQL),
                "files": files,
                "certificate": self.edge.certificate()}

    def wait_for_health(self, status: int = 200, within: float = 90) -> Answer:
        deadline = time.monotonic() + within
        last = None
        while time.monotonic() < deadline:
            last = self.edge.health()
            if last is not None and last.status == status:
                return last
            time.sleep(1)
        raise AssertionError(f"health never answered {status} within {within}s; last: "
                             f"{last and (last.status, last.body[:300])}")

    def first_start(self) -> str:
        """`docker compose up` attached, as the README runs it; returns the setup token."""
        process = subprocess.Popen([*self.compose_argv(), "up"], env=self.env, cwd=REPO_ROOT,
                                   stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                                   start_new_session=True)
        lines: list[str] = []
        token: list[str] = []

        def read() -> None:
            for line in process.stdout:
                lines.append(line)
                found = re.search(r"with this token: (\S+)", re.sub(r"\x1b\[[0-9;]*m", "", line))
                if found:
                    token.append(found.group(1))

        threading.Thread(target=read, daemon=True).start()
        deadline = time.monotonic() + 600
        while not token and process.poll() is None and time.monotonic() < deadline:
            time.sleep(0.5)
        # The client, not the stack. Its whole group: the compose plugin under
        # `docker` treats its parent's death as Ctrl-C and stops every container.
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
        process.wait()
        assert token, "the first start printed no setup token:\n" + "".join(lines[-80:])
        return token[0]

    def down(self) -> None:
        self.compose("down", "-v", "--remove-orphans", timeout=300)
        self.capture.close()
