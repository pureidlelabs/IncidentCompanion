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
import re
import subprocess
from pathlib import Path

import pytest

from tests._must_run import declined
from tests._repo import REPO_ROOT

BACKUP = REPO_ROOT / "server" / "scripts" / "backup.sh"

#: Enough rows, wide enough, to clear the script's own 4096-byte floor.
ROWS = 400

#: **Unique per run, because a fixed name is shared state.** Two runs against
#: one stack -- a `verify.sh --detailed` beside a `pytest` -- would drop each
#: other's database mid-dump. The suffix is the process id, which is enough to
#: separate concurrent runs on one machine.
PROBE_DB = f"ic_backup_probe_{os.getpid()}"


#: **Its own project and port, not whatever the analyst has up.**
#: `test_container_runtime.py` keeps a run of this tier off somebody's stack by
#: naming its own project, and it matters more here: these cases create and drop
#: databases. The port is this tier's alone, so a dev stack on the default can
#: stay up beside it.
PROJECT = "incidentcompanion-backup-test"
PG_PORT = "55599"

COMPOSE_FILE = REPO_ROOT / "server" / "compose.dev.yaml"


def _stack_env() -> dict[str, str]:
    """The two variables `compose.dev.yaml` reads, and nothing else.

    **Not `stack.mjs`.** It imports `proper-lockfile`, so it needs an installed
    `node_modules`; the `containers` job checks out and runs pytest with neither
    node nor `npm ci`, so the export fails there and every case declined. The
    compose file defaults every other variable, so this tier describes its own
    stack in two lines rather than depend on a toolchain the job does not have.
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

    yield from _probe_database(env)

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
        # **Analyzed, because the script counts `n_live_tup`.** Those are the
        # planner's statistics, which are empty until something gathers them --
        # so an unanalyzed table dumps and restores correctly and is counted as
        # zero rows on both sides.
        "analyze case_note"
    ))
    if filled.returncode != 0:
        declined("The backup verification", f"could not fill {PROBE_DB}: {filled.stderr}")

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

    # **The counts, not the word.** `restored N rows, against M in the source`
    # with M of zero is the script's shortfall check switching itself off: the
    # comparison it exists for is skipped and only `N > 0` remains, which is the
    # exact state that once called a dump restoring 103 of 643 rows good. The
    # fixture analyzes for this reason, and nothing else checks the analyze took.
    counted = re.search(r"restored (\d+) rows, against (\d+) in the source", result.stdout)
    assert counted, f"the run never reported a restore:\n{result.stdout}"
    restored, source = int(counted.group(1)), int(counted.group(2))
    assert source >= ROWS, (
        f"the source counted {source} rows for {ROWS} inserted, so the shortfall "
        "check compared against nothing")
    assert restored == source, (
        f"restored {restored} against {source} in the source")
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
