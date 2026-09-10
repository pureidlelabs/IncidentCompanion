#!/usr/bin/env bash
#
# Take a backup of the case database, and prove it is restorable.
#
#   ./scripts/backup.sh                      write one to ./backups
#   ./scripts/backup.sh --to /some/where     ...somewhere else
#   ./scripts/backup.sh --verify             ...and restore it into a scratch
#                                            database to prove it reads back
#
# **A backup nobody has restored is a file, not a backup.** `--verify` is the
# whole reason this is a script rather than a line in the documentation: it
# restores into a throwaway database and counts the rows back, so a dump that
# is truncated, empty, or written while the schema was half-applied fails here
# rather than during an incident.
#
# **Custom format (`-Fc`), not plain SQL.** It compresses, it restores
# selectively, and `pg_restore` can list its contents -- which is what makes
# the verification below cheap. A plain-SQL dump can only be verified by
# running it.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"


# **`ic_migrate`, not `ic_app`.** `ic_app` is subject to every row-level
# security policy, so a dump taken as it silently contains only the rows that
# role can see -- which is a backup that restores to an emptier database and
# reports success. The dump role has to be able to read every row.
DUMP_URL="${BACKUP_DATABASE_URL:-postgres://ic_migrate:ic_migrate@127.0.0.1:55432/incidentcompanion}"

TO="$HERE/backups"
VERIFY=0
CHECK=""
# **A `while`, not `for arg in "$@"`.** `shift` inside a `for` does not advance
# the loop -- it renumbers the positional parameters underneath an iterator that
# is walking a snapshot, so `--verify --to /x` read the directory as `--to` and
# the script failed inside `mkdir` rather than at the flag it misread.
while [ $# -gt 0 ]; do
  case "$1" in
    --verify) VERIFY=1 ;;
    # **Verifying a file that already exists, rather than only one just made.**
    # Without it the guards below are unreachable except through a fresh dump,
    # so nothing can be pointed at a known-bad archive to prove they bite -- and
    # it answers the question an operator actually has at 3am, which is whether
    # last night's backup is any good.
    --check) shift; CHECK="${1:?--check needs a file}"; VERIFY=1 ;;
    --check=*) CHECK="${1#--check=}"; VERIFY=1 ;;
    --to) shift; TO="${1:?--to needs a directory}" ;;
    --to=*) TO="${1#--to=}" ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

# **The container's client when the host has none**, which is the usual case:
# the Postgres client tools are not a dependency of anything else here, so a
# script that requires them is a script that fails on the standard development
# machine. The URL's host is rewritten because inside the container
# `127.0.0.1` is the container.
#
# **A host `pg_dump` is not the same as a usable one.** It refuses a server
# newer than itself outright -- `aborting because of server version mismatch`,
# measured with a 16.15 client against this stack's 18.6 -- so a machine
# carrying an older client is worse off than one carrying none.
# `IC_BACKUP_IN_CONTAINER=1` forces the container's, which is always the
# server's own version; the tier that exercises this script sets it so the
# check does not depend on what a runner happens to ship.
IN_CONTAINER="${IC_BACKUP_IN_CONTAINER:-0}"
if [ "$IN_CONTAINER" = 0 ]; then
  command -v pg_dump > /dev/null || IN_CONTAINER=1
fi

# **Whatever authority the URL carries, not one spelling of it.** A literal
# `127.0.0.1:55432` here is the main checkout's port, so on any other stack the
# rewrite silently matched nothing and the container was handed the host's
# address -- where that port is the container itself, and `pg_dump` fails with
# `connection refused` on a database that is up. Every worktree gets its own
# port from `stack.mjs`, so that was every worktree.
#
# **Parameter expansion rather than one regex.** The authority is what has to
# change and everything either side of it has to survive: a URL with no
# credentials at all (trust auth, or a `.pgpass`), a password holding `@` or
# `/`, a `?sslmode=` on the end. `##*@` takes the *last* `@`, so a password
# containing one cannot be mistaken for the host delimiter.
in_container_url() {
  local scheme rest userinfo path
  scheme="${1%%://*}"
  rest="${1#*://}"
  userinfo=""
  case "$rest" in
    *@*) userinfo="${rest%@*}@"; rest="${rest##*@}" ;;
  esac
  case "$rest" in
    */*) path="/${rest#*/}" ;;
    *)   path="" ;;
  esac
  printf '%s://%slocalhost:5432%s' "$scheme" "$userinfo" "$path"
}

# **The URL for whichever client `pg` is about to run**, which is the whole
# point: rewriting unconditionally handed the *host* client the container's
# address, so the row count came from a different server than the dump. Where
# anything answers on the host's own 5432 -- a system Postgres is the normal
# case on a self-hosted box -- that is a source count from an unrelated
# database, and a truncated dump clears the shortfall check against it.
pg_url() {
  if [ "$IN_CONTAINER" = 1 ]; then in_container_url "$1"; else printf '%s' "$1"; fi
}

# The admin database on the same server the dump came from, as the superuser.
# Only the authority is carried across, so a stack on any port verifies into
# itself rather than into whatever is listening on somebody else's.
admin_url_for() {
  local rest authority
  rest="${1#*://}"
  authority="${rest##*@}"
  authority="${authority%%/*}"
  printf 'postgres://incidentcompanion:incidentcompanion@%s/postgres' "$authority"
}

pg() {
  local tool="$1"; shift
  if [ "$IN_CONTAINER" = 0 ]; then
    "$tool" "$@"
  else
    docker compose -f "$HERE/compose.dev.yaml" exec -T postgres "$tool" "$@"
  fi
}

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [ -n "$CHECK" ]; then
  [ -f "$CHECK" ] || { echo "no such file: $CHECK" >&2; exit 1; }
  FILE="$CHECK"
  echo "==> checking $FILE"
else
  mkdir -p "$TO"
  FILE="$TO/incidentcompanion-$STAMP.dump"

  echo "==> dumping to $FILE"
  # **Written through stdout, not `--file`.** In the container path `--file`
  # would write inside the container, where nothing can read it afterwards and
  # the next run's size check would find an absent file rather than a bad one.
  pg pg_dump --format=custom --no-owner --no-privileges "$(pg_url "$DUMP_URL")" > "$FILE"
fi

# **Size is the cheapest lie detector there is.** A dump of a database the
# client could not reach is a valid, tiny, restorable file containing nothing.
BYTES=$(wc -c < "$FILE" | tr -d ' ')
if [ "$BYTES" -lt 4096 ]; then
  echo "the dump is only $BYTES bytes -- that is an empty database, not a backup" >&2
  exit 1
fi
echo "    $BYTES bytes"

# **This reads the table of contents, and that is all it proves.** Measured
# 2026-08-12: `pg_restore --list` exits 0 on a dump truncated to three quarters
# of its length, because the contents list is written at the *start* of the
# archive. So this catches a file that is not an archive at all, and it does not
# catch a short one — `--verify` is the only thing that does.
echo "==> checking the archive reads"
TABLES=$(pg pg_restore --list < "$FILE" | grep -c "TABLE DATA" || true)
[ "$TABLES" -gt 0 ] || { echo "the archive holds no table data" >&2; exit 1; }
echo "    $TABLES tables with data"

# **Counted, not estimated.** `pg_stat_user_tables.n_live_tup` is the planner's
# guess, maintained by pgstat, and the two sides of the comparison below are not
# the same quantity: the source's carries whatever ANALYZE and the pending
# insert counters have left there, the restore's carries `pg_restore`'s COPY
# counts. Measured on a table of 60000 rows loaded and analysed in one session,
# `n_live_tup` read 120000 -- so a sound backup was declared 50% short, three
# runs out of three. And it reads 0 after `pg_stat_reset()`, an unclean
# shutdown, a promoted standby or a major-version upgrade, which switched the
# shortfall check off entirely and printed `ok` over a dump missing 96% of the
# data.
#
# `query_to_xml` is what makes an exact count possible in one statement: a plain
# `count(*)` cannot take a table name from a column, and a loop over the catalog
# needs a language this script cannot assume is installed.
ROW_COUNT_SQL="select coalesce(sum((xpath('/row/c/text()',
  query_to_xml(format('select count(*) as c from %I.%I', schemaname, relname),
               false, true, '')))[1]::text::bigint), 0)
  from pg_stat_user_tables"

SOURCE_ROWS=$(pg psql -qtAX "$(pg_url "$DUMP_URL")" -c \
  "$ROW_COUNT_SQL" | tr -d '[:space:]')

if [ "$VERIFY" = 1 ]; then
  # **Lower-cased, because Postgres folds an unquoted identifier.** The stamp
  # carries a `T` and a `Z`, so `create database verify_…T…Z` creates
  # `verify_…t…z` and connecting by the name we asked for fails with "database
  # does not exist" — on a database that was just created successfully.
  SCRATCH="$(echo "verify_$STAMP" | tr '[:upper:]' '[:lower:]')"
  # **Defaulted from the dump's own authority, not a second literal port.**
  # `VERIFY_ADMIN_URL` used to name `127.0.0.1:55432` outright, so a worktree
  # whose `BACKUP_DATABASE_URL` pointed at its own stack restored its dump into
  # the *main checkout's* Postgres and counted rows there. The credentials are
  # the admin role's; only the host and port are carried across.
  ADMIN_URL="${VERIFY_ADMIN_URL:-$(admin_url_for "$DUMP_URL")}"
  ADMIN_URL="$(pg_url "$ADMIN_URL")"
  echo "==> restoring into $SCRATCH to prove it reads back"
  # Dropped on the way out whatever happens: a failed verification that leaves
  # a database behind turns the next run into a confusing name collision.
  trap 'pg psql -q "$ADMIN_URL" -c "drop database if exists $SCRATCH" > /dev/null 2>&1 || true' EXIT
  pg psql -q "$ADMIN_URL" -c "drop database if exists $SCRATCH"
  pg psql -q "$ADMIN_URL" -c "create database $SCRATCH"

  RESTORE_URL="${ADMIN_URL%/*}/$SCRATCH"
  # `--no-owner`: the scratch database has none of this install's roles, and
  # ownership failures are noise rather than a restore that did not work.
  #
  # **The exit status is read, and `if !` is what reads it.** A truncated
  # archive exits 1 from `pg_restore` and then reports a plausible-looking row
  # count, so swallowing the status hides the loudest signal there is -- and
  # under `set -e` a trailing `R=$?` is never reached either, because the shell
  # leaves on the failing command. Measured against a dump truncated to three
  # quarters: the run ended after `restoring into ...` saying nothing about
  # pg_restore, which is the one thing an operator needs at 3am.
  #
  # The log is per-run: a fixed `/tmp` path is shared by every worktree and
  # every parallel run on the machine, so the five lines tailed could be
  # another run's.
  # **Bare `mktemp`.** `-t <template>` is a BSD spelling: GNU coreutils and
  # busybox both refuse a template with fewer than three `X`s, so `mktemp -t
  # ic-restore` exits 1 on every Linux host -- and under `set -e` that aborts
  # the verification of a sound backup, reporting a good dump as bad. The rest
  # of this tree uses bare `mktemp` for the same reason.
  RESTORE_LOG="$(mktemp)"
  if ! pg pg_restore --no-owner --dbname="$RESTORE_URL" < "$FILE" > "$RESTORE_LOG" 2>&1; then
    echo "pg_restore refused this archive:" >&2
    tail -5 "$RESTORE_LOG" >&2
    rm -f "$RESTORE_LOG"
    exit 1
  fi
  rm -f "$RESTORE_LOG"

  ROWS=$(pg psql -qtAX "$RESTORE_URL" -c "$ROW_COUNT_SQL" | tr -d '[:space:]')
  echo "    restored $ROWS rows, against $SOURCE_ROWS in the source"

  # **Equal, because both sides are now counted rather than estimated.** The
  # tolerance existed to absorb the planner's drift; with `count(*)` on both
  # sides the only honest difference is a write that landed between the dump and
  # the count, so anything else is a dump that lost rows.
  #
  # **A source of zero is refused rather than waved through.** It used to switch
  # the comparison off, leaving `ROWS > 0` -- which passed a restore missing 96%
  # of the data. An empty source is either a database worth no backup or a
  # count that failed, and neither is something to certify.
  [ -n "$SOURCE_ROWS" ] && [ "$SOURCE_ROWS" -gt 0 ] || {
    echo "the source counted no rows at all -- there is nothing here to verify a backup of" >&2
    exit 1; }
  [ "${ROWS:-0}" -gt 0 ] || {
    echo "the restore produced no rows -- this backup would not save you" >&2; exit 1; }
  [ "$ROWS" -eq "$SOURCE_ROWS" ] || {
    echo "the restore holds $ROWS rows against $SOURCE_ROWS in the source -- this backup is incomplete" >&2
    exit 1; }
fi

echo "==> ok: $FILE"
