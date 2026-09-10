"""`backup.sh --verify` is run, against a database it dumps and restores.

**The script existed and nothing had ever run it.** Its own header says why that
matters -- *"A backup nobody has restored is a file, not a backup"* -- and
`openspec/specs/state/spec.md` requires the recovery be proven rather than
believed. A verification nothing exercises is the same belief one level up.
-> #57

**Against its own database, not the developer's.** The cases create a throwaway
database, fill it, and point `BACKUP_DATABASE_URL` at that: a test that dumped
the dev database would be slow, would vary with whatever was seeded, and would
leave a scratch database beside somebody's work.

**The negative case is the one that proves anything.** A restore that succeeds
says the happy path works; only a refusal shows the guards are load-bearing, and
the script's own comment records that `pg_restore --list` exits 0 on a truncated
archive because the contents list is written at the start. So the archive is
truncated deliberately and the run has to fail.
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest

from tests._must_run import declined
from tests._repo import REPO_ROOT

BACKUP = REPO_ROOT / "server" / "scripts" / "backup.sh"

#: Enough rows, wide enough, to clear the script's own 4096-byte floor.
ROWS = 400
PROBE_DB = "ic_backup_probe"


def _stack_env() -> dict[str, str]:
    """This checkout's stack environment, from the one place that derives it."""
    exported = subprocess.run(
        ["node", "server/scripts/stack.mjs", "--export"],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=120)
    if exported.returncode != 0:
        return {}
    env = dict(os.environ)
    for line in exported.stdout.splitlines():
        line = line.strip()
        if line.startswith("export ") and "=" in line:
            key, _, value = line[len("export "):].partition("=")
            env[key] = value.strip("'")
    return env


def _compose(env: dict[str, str], *argv: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["node", "server/scripts/stack.mjs", "--compose", *argv],
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
    if not env.get("IC_COMPOSE_PROJECT"):
        declined("The backup verification", "stack.mjs could not describe the stack")

    if _compose(env, "up", "-d", "--wait", "postgres").returncode != 0:
        declined("The backup verification", "no Postgres container could be raised")

    _psql(env, "postgres", f"drop database if exists {PROBE_DB}")
    made = _psql(env, "postgres", f"create database {PROBE_DB}")
    if made.returncode != 0:
        declined("The backup verification", f"could not create {PROBE_DB}: {made.stderr}")

    filled = _psql(env, PROBE_DB, (
        "create table case_note (id int primary key, body text not null); "
        f"insert into case_note select g, repeat(md5(g::text), 8) "
        f"from generate_series(1, {ROWS}) g; "
        # **Analyzed, because the script counts `n_live_tup`.** Those are the
        # planner's statistics, which are empty until something gathers them --
        # so an unanalyzed table dumps and restores correctly and is counted as
        # zero rows on both sides.
        "analyze case_note"
    ))
    if filled.returncode != 0:
        declined("The backup verification", f"could not fill {PROBE_DB}: {filled.stderr}")

    yield env

    _psql(env, "postgres", f"drop database if exists {PROBE_DB}")


def _run_backup(env: dict[str, str], into: Path, *argv: str) -> subprocess.CompletedProcess:
    at = dict(env)
    at["BACKUP_DATABASE_URL"] = (
        f"postgres://incidentcompanion:incidentcompanion@127.0.0.1:"
        f"{env['IC_PG_PORT']}/{PROBE_DB}")
    at["VERIFY_ADMIN_URL"] = (
        f"postgres://incidentcompanion:incidentcompanion@127.0.0.1:"
        f"{env['IC_PG_PORT']}/postgres")
    return subprocess.run(
        ["bash", str(BACKUP), "--to", str(into), *argv],
        cwd=REPO_ROOT / "server", env=at, capture_output=True, text=True, timeout=900)


def test_a_dump_restores_into_a_scratch_database_and_counts_back(
        probe_database: dict[str, str], tmp_path: Path):
    """The whole reason the script exists, exercised rather than believed."""
    result = _run_backup(probe_database, tmp_path, "--verify")

    assert result.returncode == 0, (
        f"backup.sh --verify failed:\n{result.stdout}\n{result.stderr}")
    assert "restored" in result.stdout, (
        f"the run never reported a restore:\n{result.stdout}")
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
