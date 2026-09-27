#!/bin/sh
# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only
#
# A copy of a running install's durable state, and the way back to it.
#
#   docker/backup.sh backup [DIR]   write a copy (default backups/<time>) and verify it
#   docker/backup.sh verify DIR     prove a copy restores, and that its evidence is whole
#   docker/backup.sh restore DIR    replace this install's state with the copy's
#
# Acts on the install `compose.yaml` names, as `docker compose` would from the
# repository root, so `IC_STACK_PROJECT` selects another one. A copy is
# `db.dump` (the database, without anybody's session), `evidence.tar` (the
# artefacts beside it), `shape` (the store's shape it was taken under) and
# `SHA256SUMS` (each of those three as it was written).
# Every command exits non-zero, having changed nothing, when it cannot finish.
set -eu
# The copy holds every password hash and case, so it is no more readable than the volumes it copies.
umask 077

ROOT="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"

compose() { docker compose -f "$ROOT/compose.yaml" "$@"; }

# The superuser over the container's own socket, which the image trusts, so
# no password is needed and none is printed.
sql() {
  database="$1"; shift
  compose exec -T postgres psql -qtAX -v ON_ERROR_STOP=1 -U incidentcompanion -d "$database" -c "$@"
}

fail() { echo "$*" >&2; exit 1; }

# Sessions and one-time codes: restoring must not sign anybody back in.
EPHEMERAL="session verification"

PARTS="db.dump evidence.tar shape"

SHAPE_SQL="select md5(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable,
  ',' order by table_name, column_name)) from information_schema.columns where table_schema = 'public'"

# Counted, not estimated: `query_to_xml` is what lets one statement count
# every table by name.
ROWS_SQL="select coalesce(sum((xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I',
  schemaname, relname), false, true, '')))[1]::text::bigint), 0) from pg_stat_user_tables
  where not (schemaname = 'public' and relname in ('session', 'verification'))"

NAMED_SQL="select distinct hash from evidence where stored_at is not null and hash is not null order by 1"

backup() {
  dir="${1:-$ROOT/backups/$(date -u +%Y%m%dT%H%M%SZ)}"
  mkdir -p "$dir"
  # The umask reaches only what is created, so an existing destination is closed and its parts replaced.
  chmod 700 "$dir"
  for part in $PARTS SHA256SUMS; do rm -f "$dir/$part"; done
  excluded=""
  for table in $EPHEMERAL; do excluded="$excluded --exclude-table-data=public.$table"; done
  echo "==> the database, to $dir/db.dump"
  # shellcheck disable=SC2086 # one flag per table
  compose exec -T postgres pg_dump -U incidentcompanion -d incidentcompanion \
    --format=custom --no-owner --no-privileges $excluded > "$dir/db.dump"
  sql incidentcompanion "$SHAPE_SQL" > "$dir/shape"
  # After the dump: an artefact is never rewritten, so a later archive holds
  # every one the dump names.
  echo "==> the evidence, to $dir/evidence.tar"
  compose exec -T app tar -cf - -C /evidence . > "$dir/evidence.tar"
  # shellcheck disable=SC2086 # one name per part
  (cd "$dir" && sha256sum $PARTS) > "$dir/SHA256SUMS"
  verify "$dir"
}

verify() {
  dir="${1:?verify needs the directory a copy is in}"
  for part in $PARTS SHA256SUMS; do
    [ -s "$dir/$part" ] || fail "$dir/$part is missing or empty -- this is not a whole copy"
  done
  # Damage that leaves a part readable passes every check below.
  for part in $PARTS; do
    grep -qxF "$(cd "$dir" && sha256sum "$part")" "$dir/SHA256SUMS" \
      || fail "$dir/$part is not what was written when the copy was taken"
  done

  # The contents list is written first, so this reads a truncated archive
  # happily; the restore below is what refuses one.
  listing="$(compose exec -T postgres pg_restore --list < "$dir/db.dump")"
  for table in $EPHEMERAL; do
    if printf '%s\n' "$listing" | grep -q "TABLE DATA public $table "; then
      fail "the copy carries $table rows -- restoring it would sign those sessions back in"
    fi
    printf '%s\n' "$listing" | grep -q "TABLE public $table " \
      || fail "the copy has no $table table -- a restored install could not sign anybody in"
  done

  scratch="ic_verify_$$"
  echo "==> restoring the database into $scratch"
  sql postgres "create database $scratch" > /dev/null
  # shellcheck disable=SC2064 # the name is fixed now
  trap "sql postgres 'drop database if exists $scratch' > /dev/null 2>&1 || true" EXIT
  compose exec -T postgres pg_restore -U incidentcompanion -d "$scratch" --no-owner --no-privileges \
    --single-transaction --exit-on-error < "$dir/db.dump" > /dev/null \
    || fail "the database copy does not restore"
  rows="$(sql "$scratch" "$ROWS_SQL")"
  [ "${rows:-0}" -gt 0 ] || fail "the database copy restores to no rows at all"

  # Named by digest wherever the archive keeps them.
  held="$(tar -tf "$dir/evidence.tar")" || fail "the evidence archive does not read"
  named="$(sql "$scratch" "$NAMED_SQL")"
  missing=0
  for digest in $named; do
    printf '%s\n' "$held" | grep -q "/$digest\$" || missing=$((missing + 1))
  done
  [ "$missing" -eq 0 ] || fail "$missing artefacts the database names are not in the evidence archive"
  sql postgres "drop database $scratch" > /dev/null
  trap - EXIT
  echo "==> ok: $rows rows, $(printf '%s\n' "$named" | grep -c . || true) artefacts, every one present"
}

restore() {
  dir="${1:?restore needs the directory a copy is in}"
  verify "$dir"
  here="$(sql incidentcompanion "$SHAPE_SQL")"
  if [ "$(cat "$dir/shape")" != "$here" ]; then
    echo "Refused: the copy was taken under another shape of the store ($(cat "$dir/shape")," >&2
    echo "this install is $here). Nothing was changed." >&2
    exit 2
  fi

  echo "==> stopping the server and the edge"
  compose stop app nginx
  echo "==> the database"
  compose exec -T postgres pg_restore -U incidentcompanion -d incidentcompanion --clean --if-exists \
    --no-owner --no-privileges --role=ic_migrate --single-transaction --exit-on-error < "$dir/db.dump" > /dev/null
  # Nobody is signed in afterwards, including from the session cache. The
  # password expands inside the container.
  # shellcheck disable=SC2016
  compose exec -T redis sh -c 'redis-cli --no-auth-warning -a "$IC_REDIS_PASSWORD" flushall' > /dev/null
  echo "==> the evidence"
  compose run --rm --no-deps -T --entrypoint sh app \
    -c 'find /evidence -mindepth 1 -delete && tar -xf - -C /evidence' < "$dir/evidence.tar"
  echo "==> starting again"
  compose up -d --wait
  echo "==> restored from $dir"
}

case "${1:-}" in
  backup) shift; backup "$@" ;;
  verify) shift; verify "$@" ;;
  restore) shift; restore "$@" ;;
  *) echo "usage: docker/backup.sh backup [DIR] | verify DIR | restore DIR" >&2; exit 2 ;;
esac
