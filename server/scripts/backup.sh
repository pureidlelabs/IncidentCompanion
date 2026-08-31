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
IN_CONTAINER=0
command -v pg_dump > /dev/null || IN_CONTAINER=1
CONTAINER_URL="${DUMP_URL/127.0.0.1:55432/localhost:5432}"

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
  if [ "$IN_CONTAINER" = 0 ]; then
    pg_dump --format=custom --no-owner --no-privileges "$DUMP_URL" > "$FILE"
  else
    pg pg_dump --format=custom --no-owner --no-privileges "$CONTAINER_URL" > "$FILE"
  fi
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

# **Counted from the source now, so the restore has something to be equal to.**
# Checking only that the restore produced *some* rows passes a truncated dump:
# the same file above restored 103 of 643 rows and would have been called good.
SOURCE_ROWS=$(pg psql -qtAX "$CONTAINER_URL" -c \
  "select coalesce(sum(n_live_tup), 0) from pg_stat_user_tables" | tr -d '[:space:]')

if [ "$VERIFY" = 1 ]; then
  # **Lower-cased, because Postgres folds an unquoted identifier.** The stamp
  # carries a `T` and a `Z`, so `create database verify_…T…Z` creates
  # `verify_…t…z` and connecting by the name we asked for fails with "database
  # does not exist" — on a database that was just created successfully.
  SCRATCH="$(echo "verify_$STAMP" | tr '[:upper:]' '[:lower:]')"
  ADMIN_URL="${VERIFY_ADMIN_URL:-postgres://incidentcompanion:incidentcompanion@127.0.0.1:55432/postgres}"
  [ "$IN_CONTAINER" = 1 ] && ADMIN_URL="${ADMIN_URL/127.0.0.1:55432/localhost:5432}"
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
  # **The exit status is read, not swallowed.** `|| true` here was hiding the
  # loudest signal there is: a truncated archive exits 1 from `pg_restore` and
  # then reports a plausible-looking row count.
  pg pg_restore --no-owner --dbname="$RESTORE_URL" < "$FILE" > /tmp/ic-restore.log 2>&1; R=$?
  if [ $R -ne 0 ]; then
    echo "pg_restore refused this archive (exit $R):" >&2
    tail -5 /tmp/ic-restore.log >&2
    exit 1
  fi

  ROWS=$(pg psql -qtAX "$RESTORE_URL" -c \
    "select coalesce(sum(n_live_tup), 0) from pg_stat_user_tables" | tr -d '[:space:]')
  echo "    restored $ROWS rows, against $SOURCE_ROWS in the source"

  # **Equal, not merely non-zero.** The row counts come from the planner's
  # statistics, so they are compared with a small tolerance rather than for
  # exact equality — what is being caught is a dump that lost a table, not one
  # that lost a row between the dump and the count.
  [ "${ROWS:-0}" -gt 0 ] || {
    echo "the restore produced no rows -- this backup would not save you" >&2; exit 1; }
  if [ "$SOURCE_ROWS" -gt 0 ]; then
    SHORTFALL=$(( (SOURCE_ROWS - ROWS) * 100 / SOURCE_ROWS ))
    [ "$SHORTFALL" -lt 5 ] || {
      echo "the restore is $SHORTFALL% short of the source -- this backup is incomplete" >&2
      exit 1; }
  fi
fi

echo "==> ok: $FILE"
