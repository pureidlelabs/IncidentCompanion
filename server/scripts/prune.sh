#!/usr/bin/env bash
#
# Clean up what accumulates beside the cases.
#
#   ./scripts/prune.sh                  say what would go, change nothing
#   ./scripts/prune.sh --apply          actually do it
#   ./scripts/prune.sh --keep 14        keep 14 days of backups instead of 30
#
# **Dry by default, and that is not politeness.** Every other flag in this repo
# does what it says; this one deletes, and the failure mode of a delete script
# with a wrong path is not recoverable by reading the output afterwards. Run it
# once to read, once to apply.
#
# **It does not touch case rows.** Deleting a case is an analyst's decision made
# on a screen, with a confirmation, attributed to them. A cron job that removes
# cases by age is a second way to lose data and answers a question nobody has
# asked -- point-in-time restore is what covers the case a moment of that kind
# would be for.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"


APPLY=0
KEEP_DAYS=30
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --keep) shift; KEEP_DAYS="${1:?--keep needs a number of days}" ;;
    --keep=*) KEEP_DAYS="${1#--keep=}" ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

say() {
  if [ "$APPLY" = 1 ]; then echo "    removing $1"; else echo "    would remove $1"; fi
}

echo "==> backups older than $KEEP_DAYS days"
if [ -d "$HERE/backups" ]; then
  # `-mtime +N` is "more than N days", which is what "keep N days" means.
  # `-print0`/`read -d ''` rather than a bare loop: a path with a space in it
  # is the classic way a cleanup script deletes the wrong thing.
  while IFS= read -r -d '' old; do
    say "$old"
    [ "$APPLY" = 1 ] && rm -f "$old"
  done < <(find "$HERE/backups" -maxdepth 1 -name '*.dump' -mtime "+$KEEP_DAYS" -print0)
else
  echo "    no backups directory"
fi

echo "==> build output"
for path in "$HERE/dist" "$HERE/../ui/dist" "$HERE/test-results" "$HERE/playwright-report"; do
  [ -e "$path" ] || continue
  say "$path"
  [ "$APPLY" = 1 ] && rm -rf "$path"
done

echo "==> expired sessions"
# **Deleted rather than left.** Better Auth does not sweep them, so the table
# grows without bound on an install that is used -- and an expired row is not
# a credential, so nothing is lost with it. Counted first, so the dry run has
# a number to show rather than an intention.
DB_URL="${DATABASE_URL:-postgres://ic_migrate:ic_migrate@127.0.0.1:55432/incidentcompanion}"

# **Falls back to the container's own client**, because the host usually has
# none -- and a cleanup script that reports "psql is not on PATH" on the
# standard development machine is a script nobody runs. The launcher already
# reaches Postgres this way to apply its roles.
#
# **`host.docker.internal` is not needed: it connects over the compose
# network.** Rewriting the host is what makes this work from inside the
# container, where `127.0.0.1` is the container itself.
run_sql() {
  if command -v psql > /dev/null; then
    psql -qtAX "$DB_URL" -c "$1" 2>/dev/null
  else
    docker compose -f "$HERE/compose.dev.yaml" exec -T postgres \
      psql -qtAX "${DB_URL/127.0.0.1:55432/localhost:5432}" -c "$1" 2>/dev/null
  fi
}

EXPIRED=$(run_sql 'select count(*) from "session" where expires_at < now()' || echo "")
EXPIRED="$(echo "$EXPIRED" | tr -d '[:space:]')"
if [ -z "$EXPIRED" ]; then
  echo "    could not reach the database"
else
  say "$EXPIRED expired session rows"
  [ "$APPLY" = 1 ] && run_sql 'delete from "session" where expires_at < now()' > /dev/null
fi

if [ "$APPLY" = 0 ]; then
  echo
  echo "Nothing was changed. Re-run with --apply to do it."
fi
