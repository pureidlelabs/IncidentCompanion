"""`backup.sh --verify` is run, against a throwaway database of its own. -> #57

**The negative case is the one that proves anything.** A restore that succeeds
shows the happy path; only a refusal shows the guards are load-bearing, and
`pg_restore --list` exits 0 on a truncated archive. So one is truncated
deliberately and the run has to fail.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path

import pytest

from tests._must_run import declined
from tests._repo import REPO_ROOT

BACKUP = REPO_ROOT / "server" / "scripts" / "backup.sh"

#: Enough rows, wide enough, to clear the script's own 4096-byte floor.
ROWS = 400

#: Unique per run: a fixed name lets two runs drop each other's database.
PROBE_DB = f"ic_backup_probe_{os.getpid()}"


#: Its own project and port, so a run never touches the analyst's stack --
#: these cases create and drop databases. Same convention as
#: `test_container_runtime.py`.
PROJECT = "incidentcompanion-backup-test"
PG_PORT = "55599"

COMPOSE_FILE = REPO_ROOT / "server" / "compose.dev.yaml"


def _stack_env() -> dict[str, str]:
    """The two variables `compose.dev.yaml` reads, and nothing else.

    **Not `stack.mjs`**, which needs an installed `node_modules` the
    `containers` job does not have -- every case declined there.
    """
    return dict(
        os.environ,
        IC_COMPOSE_PROJECT=PROJECT,
        IC_PG_PORT=PG_PORT,
        # **The container's client, whatever the host carries.** A runner
        # shipping `pg_dump` 16 refuses this stack's 18.6 server outright, so
        # leaving the choice to `command -v` makes the result depend on the
        # machine rather than on the script.
        IC_BACKUP_IN_CONTAINER="1",
    )


def _compose(env: dict[str, str], *argv: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE_FILE), *argv],
        cwd=REPO_ROOT, env=env, capture_output=True, text=True, timeout=600)


def _psql(env: dict[str, str], database: str, statement: str) -> subprocess.CompletedProcess:
    """A statement, run by the container's own client.

    The Postgres client tools are not a dependency of anything here, so the
    container's are the ones that exist -- which is the same reason `backup.sh`
    reaches for them.
    """
    url = f"postgres://incidentcompanion:incidentcompanion@localhost:5432/{database}"
    return _compose(env, "exec", "-T", "postgres", "psql", "-qtAX", url, "-c", statement)


@pytest.fixture(scope="module")
def probe_database() -> dict[str, str]:
    """A throwaway database with enough rows to dump, dropped on the way out."""
    env = _stack_env()
    raised = _compose(env, "up", "-d", "--wait", "postgres")
    if raised.returncode != 0:
        # The daemon's own words: a decline naming only "no Postgres" leaves an
        # operator with nothing to go and fix, which is the same fault as the
        # message it replaces.
        declined("The backup verification",
                 f"no Postgres container could be raised: {raised.stderr.strip()[-400:]}")

    # Stopped, because raising it made it ours, and a stranded container holds
    # a tmpfs database. Unconditional: the project is this tier's alone.
    try:
        yield from _probe_database(env)
    finally:
        _compose(env, "down", "-v")

def _probe_database(env: dict[str, str]):
    _psql(env, "postgres", f"drop database if exists {PROBE_DB}")
    made = _psql(env, "postgres", f"create database {PROBE_DB}")
    if made.returncode != 0:
        declined("The backup verification", f"could not create {PROBE_DB}: {made.stderr}")

    # **From here the database exists, so every exit runs the drop.** A
    # `declined()` below is `pytest.fail` under CI, which would otherwise leave
    # the probe database behind on exactly the path that fails.
    try:
        yield from _filled_and_dropped(env)
    finally:
        _psql(env, "postgres", f"drop database if exists {PROBE_DB}")


def _filled_and_dropped(env: dict[str, str]):
    filled = _psql(env, PROBE_DB, (
        "create table case_note (id int primary key, body text not null); "
        f"insert into case_note select g, repeat(md5(g::text), 8) "
        f"from generate_series(1, {ROWS}) g; "
        # The two Better Auth tables a copy must not carry. Only the columns
        # the assertion needs: this is about whether the rows travel, not
        # about the shape they travel in.
        'create table "session" (id text primary key, token text not null); '
        'insert into "session" values (\'s-1\', \'tok-1\'), (\'s-2\', \'tok-2\'); '
        'create table "verification" (id text primary key, value text not null); '
        'insert into "verification" values (\'v-1\', \'code-1\')'
    ))
    if filled.returncode != 0:
        declined("The backup verification", f"could not fill {PROBE_DB}: {filled.stderr}")

    # **The statistics are reset on purpose**, so an estimating script cannot
    # pass: `count(*)` still answers ROWS while `n_live_tup` answers 0. At this
    # size the estimate is otherwise correct and the two are indistinguishable.
    # It is also the state an unclean shutdown or a promoted standby leaves.
    reset = _psql(env, PROBE_DB, "analyze case_note; select pg_stat_reset()")
    if reset.returncode != 0:
        declined("The backup verification", f"could not reset stats in {PROBE_DB}: {reset.stderr}")

    yield env


def _run_backup(env: dict[str, str], into: Path, *argv: str) -> subprocess.CompletedProcess:
    at = dict(env)
    at["BACKUP_DATABASE_URL"] = (
        f"postgres://incidentcompanion:incidentcompanion@127.0.0.1:"
        f"{env['IC_PG_PORT']}/{PROBE_DB}")
    # **`VERIFY_ADMIN_URL` is deliberately unset.** The script derives it from
    # the dump's own authority, and that derivation is the guard against a
    # worktree restoring its dump into another stack's Postgres -- so setting
    # it here would test the override and leave the default unexercised.
    at.pop("VERIFY_ADMIN_URL", None)
    return subprocess.run(
        ["bash", str(BACKUP), "--to", str(into), *argv],
        cwd=REPO_ROOT / "server", env=at, capture_output=True, text=True, timeout=900)


def test_a_dump_restores_into_a_scratch_database_and_counts_back(
        probe_database: dict[str, str], tmp_path: Path):
    """The whole reason the script exists, exercised rather than believed."""
    result = _run_backup(probe_database, tmp_path, "--verify")

    assert result.returncode == 0, (
        f"backup.sh --verify failed:\n{result.stdout}\n{result.stderr}")

    counted = re.search(r"restored (\d+) rows, against (\d+) in the source", result.stdout)
    assert counted, f"the run never reported a restore:\n{result.stdout}"
    restored, source = int(counted.group(1)), int(counted.group(2))

    # Against what the fixture inserted, not against each other: comparing the
    # two reported figures only shows the script agrees with itself.
    assert source == ROWS, (
        f"the source counted {source} for {ROWS} inserted -- the script is estimating "
        "rather than counting")
    assert restored == ROWS, (
        f"the restore counted {restored} for {ROWS} inserted")
    dumps = list(tmp_path.glob("incidentcompanion-*.dump"))
    assert len(dumps) == 1, f"expected one dump, found {[d.name for d in dumps]}"
    assert dumps[0].stat().st_size > 4096, "the dump is below the script's own floor"


def test_a_truncated_archive_is_refused_and_says_why(
        probe_database: dict[str, str], tmp_path: Path):
    """The guard that matters, and the one a passing restore cannot demonstrate.

    **`--list` is not enough and the script says so**: the contents list is
    written at the start of the archive, so a truncated dump still lists its
    tables. Only the restore catches it, which is why `--verify` exists at all.
    """
    made = _run_backup(probe_database, tmp_path, "--verify")
    assert made.returncode == 0, f"could not take a sound dump first:\n{made.stderr}"
    dump = next(iter(tmp_path.glob("incidentcompanion-*.dump")))

    whole = dump.read_bytes()
    short = tmp_path / "truncated.dump"
    short.write_bytes(whole[: int(len(whole) * 0.75)])

    result = _run_backup(probe_database, tmp_path, "--check", str(short))

    assert result.returncode != 0, (
        "a truncated archive was called a good backup:\n" + result.stdout)
    # Named, not merely failed: a refusal that does not say pg_restore refused
    # it sends an operator to look at the database instead of the file.
    assert "pg_restore refused this archive" in result.stderr, (
        f"the refusal does not name its cause:\n{result.stdout}\n{result.stderr}")


def test_a_copy_carries_no_session_and_nobody_is_signed_in_after_it(
        probe_database: dict[str, str], tmp_path: Path):
    """`state`: *Restoring MUST NOT restore somebody's session.*

    **Read off the archive, which is what a copy is.** The scenario's own
    words are that nobody is signed in after a restore, and a row that is not
    in the dump cannot be restored by any route -- so this asserts the absence
    at the point the copy is made rather than reconstructing a login.

    **A session with no cached copy still authenticates**, which is why the
    rows travelling matters at all: `auth.config.ts` sets
    `storeSessionInDatabase` so a cache miss falls through to the database
    instead of signing everybody out, and
    `server/test/a-session-past-its-window-is-refused.test.ts` measures a
    dropped cache entry still serving 200. Redis being absent from the copy
    therefore saves nothing. -> #247

    `case_note` is asserted present in the same breath: a dump that carried no
    table data at all would satisfy the absence and nothing else.
    """
    result = _run_backup(probe_database, tmp_path, "--verify")
    assert result.returncode == 0, (
        f"backup.sh --verify failed:\n{result.stdout}\n{result.stderr}")

    dumps = sorted(tmp_path.glob("*.dump"))
    assert dumps, f"the run wrote no dump into {tmp_path}"

    listing = subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE_FILE), "exec", "-T", "postgres",
         "pg_restore", "--list"],
        input=dumps[-1].read_bytes(),
        env=probe_database, capture_output=True, timeout=300)
    assert listing.returncode == 0, (
        f"pg_restore --list refused the archive:\n{listing.stderr.decode()}")
    contents = listing.stdout.decode()

    data = [line for line in contents.splitlines() if "TABLE DATA" in line]
    assert any("case_note" in line for line in data), (
        "the archive carries no table data at all, so the absences below say nothing:\n"
        + contents)

    for table in ("session", "verification"):
        assert not any(f" {table} " in line for line in data), (
            f"the copy carries {table} rows, so a restore signs those sessions back in:\n"
            + "\n".join(data))
