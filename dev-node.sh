#!/usr/bin/env bash
#
# One command to a working screen against the **Node** backend, and only it.
#
#   ./dev-node.sh                start Postgres, Redis, Nest and Vite
#   ./dev-node.sh --keep-data    ...without wiping the database first
#   ./dev-node.sh --no-seed      ...without creating the dev analyst
#   ./dev-node.sh --api-only     just the containers and Nest
#   ./dev-node.sh --ui-only      just Vite, against a Nest already running
#   ./dev-node.sh --no-storybook ...without the kit's Storybook beside Vite
#   ./dev-node.sh --repl         an interactive shell with the app's container
#   ./dev-node.sh --down         stop the containers and exit
#
#   VITE_HOST=0.0.0.0 ./dev-node.sh --ui-only
#                                ...serving where a browser outside the
#                                container can reach it
#
# **`--api-only` and `--ui-only` restart the two halves apart.** Vite runs in
# the foreground and the EXIT trap stops Nest with it, so by default stopping
# either half stops both -- one command up, one Ctrl-C down.
#
# **Nothing here talks to the Python app**, so a screen needing a route Nest
# does not serve is visibly broken rather than quietly answered. Read a failure
# as "not built yet" unless it says otherwise. The database is a tmpfs
# recreated on every start, so the schema on screen is the schema in the tree.
set -euo pipefail

TREE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$TREE_ROOT/server"
UI_DIR="$TREE_ROOT/ui"

# **Every compose call goes through `stack.mjs`**, which is what makes that
# claim in its own docstring true. Spelling `-p` and `-f` here as well was a
# second implementation of one invocation, and the two only stayed in step by
# luck: the project name is derived per worktree, so a call that forgets it
# addresses the main checkout's containers.
compose() { node "$SERVER_DIR/scripts/stack.mjs" --compose "$@"; }

# **Every port, the compose project and the database URLs come from one
# place**, so this worktree's stack cannot land on another's -- and a second
# derivation is never added. The roles it exports are not interchangeable:
# `ic_app` never the superuser, which ignores every row-level security policy,
# and `ic_seed` for writes across every case that RLS refuses on `ic_app`.
# → `docker/db/roles.sql`
eval "$(node "$SERVER_DIR/scripts/stack.mjs" --export)"

API_PORT="${INCIDENTCOMPANION_NODE_PORT:-$IC_API_PORT}"
VITE_PORT="${VITE_PORT:-$IC_VITE_PORT}"
STORYBOOK_PORT="${STORYBOOK_PORT:-$IC_STORYBOOK_PORT}"
# **http, and not a dev-only bypass of TLS**: the server has none, nginx
# terminates it in the shipped stack, and there is no proxy here. Better Auth
# omits the `__Secure-` cookie prefix on an http base URL, so the whole loop
# must stay http.
API_URL="http://127.0.0.1:$API_PORT"
# Dev-only. The real one has no default and the app refuses to boot without it.
export AUTH_SECRET="${AUTH_SECRET:-dev-only-secret-0123456789abcdefghij}"
export AUTH_BASE_URL="$API_URL"
export PORT="$API_PORT"

SEED=1
KEEP_DATA=0
WANT_API=1
WANT_UI=1
WANT_REPL=0
WANT_STORYBOOK=1
for arg in "$@"; do
  case "$arg" in
    --no-seed) SEED=0 ;;
    --no-storybook) WANT_STORYBOOK=0 ;;
    --keep-data) KEEP_DATA=1 ;;
    --api-only) WANT_UI=0 ;;
    --ui-only) WANT_API=0 ;;
    # **Here rather than in an npm script**, so the shell gets the same
    # environment the server does -- a REPL on a different database than the
    # running server is worse than no REPL. **It manages no containers**, for
    # the `--ui-only` reason: it attaches to a stack somebody else started.
    --repl) WANT_API=0; WANT_UI=0; WANT_REPL=1 ;;
    --down)
      compose down
      exit 0
      ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

if [ "$WANT_REPL" = 1 ]; then
  echo "==> REPL against $DATABASE_URL"
  echo "    get(LibraryService), methods(CasesController), await get(...).x() — .help for the rest"
  echo "    Opening this rebuilds the demo cases, exactly as starting the server does."
  cd "$SERVER_DIR" && exec npm run --silent repl
fi

DEV_EMAIL="${INCIDENTCOMPANION_DEV_EMAIL:-analyst@example.test}"
DEV_PASSWORD="${INCIDENTCOMPANION_DEV_PASSWORD:-incidentcompanion-dev}"

# **The tree is walked from *our* pid, never matched by name** -- a name match
# reaps another worktree's server too. `--ui-only` installs no trap at all.
descendants() {
  local parent="$1" child
  for child in $(pgrep -P "$parent" 2>/dev/null || true); do
    # Deepest first: a parent reaped before its children are named leaves them
    # orphaned and unfindable.
    descendants "$child"
    echo "$child"
  done
}

cleanup() {
  local pid root
  for root in "${API_PID:-}" "${SB_PID:-}"; do
    [ -n "$root" ] || continue
    for pid in $(descendants "$root") "$root"; do
      kill "$pid" 2>/dev/null || true
    done
  done
}
# **Armed whenever this script starts something long-lived.** Gating on
# `--api-only` left Storybook orphaned on Ctrl-C under `--ui-only`, holding its
# port until the next run failed to bind it.
if [ "$WANT_API" = 1 ] || [ "$WANT_STORYBOOK" = 1 ]; then
  trap cleanup EXIT
fi

if [ "$WANT_API" = 1 ]; then

echo "==> Postgres and Redis"
# **Recreated by default, and that is what makes the printed credentials
# true.** Left running, the database keeps whatever a previous run seeded, so
# the password echoed below can be one this run never set — which reads as the
# login being broken. `--keep-data` opts out when you want to keep test data
# across a restart.
if [ "$KEEP_DATA" = 1 ]; then
  compose up -d --wait
else
  compose up -d --force-recreate --wait
fi

echo "==> roles"
# **The container does not run this itself** -- `compose.dev.yaml` mounts no
# `docker-entrypoint-initdb.d`, so a fresh database has only the superuser.
# Idempotent, so `--keep-data` re-runs it harmlessly. Through `stack.mjs`
# because `db:up` needs the same step and a second copy would drift.
(cd "$SERVER_DIR" && node scripts/stack.mjs --roles)

echo "==> schema"
# **Pushed, not migrated**, while the Node move settles.
#
# As `ic_migrate`, which owns the schema; `ic_app` has no DDL. **`npm run`,
# never `npx`** -- masked here because the dev container already has
# `node_modules` installed, and it broke a host run.
(cd "$SERVER_DIR" && DATABASE_URL="$IC_MIGRATE_DATABASE_URL" \
  npm run --silent db:push -- --force > /dev/null)

echo "==> seeding the library and the demo cases"
# **Needed here because the server stopped seeding on boot**, and this database
# is a tmpfs -- without it the dev loop has no templates, layouts, language pack
# or demo cases, and `server/e2e/` fails looking for a demo reference. **A build
# first**: `nest start --watch` below compiles on the fly and never writes
# `dist`.
SEED_ARGS="--demos"
# The dev analyst is made here rather than over HTTP: `/sign-up/email` is not
# served, and the setup token exists only in the server's console output.
if [ "$SEED" = 1 ]; then SEED_ARGS="$SEED_ARGS --dev-account"; fi
# **Both halves say why they stopped.** `npm run build` writes tsc's errors to
# *stdout*, so the `> /dev/null` this replaced sent a broken build's entire
# diagnosis to the bin - and with `set -e` the stack then exited under the
# "seeding" line having printed nothing at all. A one-character server type
# error read as the stack simply never coming up, twice, for twenty minutes.
BUILD_LOG=$(mktemp)
if ! (cd "$SERVER_DIR" && npm run --silent build) > "$BUILD_LOG" 2>&1; then
  echo "==> the server build failed, so there is nothing to seed:" >&2
  cat "$BUILD_LOG" >&2
  rm -f "$BUILD_LOG"
  exit 1
fi
if ! (cd "$SERVER_DIR" && IC_DEV_EMAIL="$DEV_EMAIL" IC_DEV_PASSWORD="$DEV_PASSWORD" \
      node dist/src/seed.js $SEED_ARGS) > "$BUILD_LOG" 2>&1; then
  echo "==> seeding failed:" >&2
  cat "$BUILD_LOG" >&2
  rm -f "$BUILD_LOG"
  exit 1
fi
rm -f "$BUILD_LOG"

echo "==> Nest on $API_URL (watching for changes)"
# `nest start --watch` rather than build-then-run: a saved change is serving
# again in ~2.2s on the swc builder, which was rejected once on a measurement
# that stopped being true.
(cd "$SERVER_DIR" && npm run --silent dev) &
API_PID=$!

# Poll rather than sleep: the build time varies and a fixed wait is either
# slow or racy. /api/health is public, so this needs no session.
for _ in $(seq 1 60); do
  if curl -fsS -m 2 "$API_URL/api/health" > /dev/null 2>&1; then break; fi
  sleep 0.5
done
# **A 503 here is not "never came up".** /api/health reports whether Postgres
# and Redis are reachable, so it fails while the process serves perfectly well.
# The body names which dependency, so it is printed rather than summarised.
HEALTH=$(curl -sS -m 2 -w '\n%{http_code}' "$API_URL/api/health" 2>/dev/null) || {
  echo "the server never came up" >&2; exit 1; }
# `${x##*$NL}` and `${x%$NL*}` rather than `tail -1` and `head -n -1`: BSD head
# has no negative count, so the GNU spelling fails on macOS — where this runs.
NL=$'\n'
case "${HEALTH##*$NL}" in
  200) ;;
  503) printf 'the server is up but its dependencies are not:\n  %s\ntry `npm run db:up` in `server`\n' \
         "${HEALTH%$NL*}" >&2; exit 1 ;;
  *)   echo "the server never came up" >&2; exit 1 ;;
esac

if [ "$SEED" = 1 ]; then
  echo "==> dev analyst: $DEV_EMAIL / $DEV_PASSWORD"
  # **Made by the seed step above, in process.** Only ever on an install with
  # no accounts: the rule is the same one the setup route reads, so a refusal
  # means somebody already claimed this install -- "sign in instead".
fi

fi   # WANT_API

# **A foreground wait, not an exit.** Without Vite to hold the script open,
# `--api-only` would run its EXIT trap immediately and kill the server it just
# started -- which reads as Nest crashing on boot.
if [ "$WANT_UI" = 0 ]; then
  echo
  echo "    Nest is up on $API_URL. Ctrl-C to stop it."
  wait "$API_PID"
  exit 0
fi

# **Storybook is the kit, and it is a second Vite dev server rather than a
# route inside the app** -- it renders each component in isolation, with its own
# module graph and its own HMR socket, so there is nothing for the app to mount.
# Started before Vite because Vite holds the foreground.
#
# **Its port comes from `stack.mjs` like every other**, so two worktrees never
# fight over 6006. `--no-open` is in the npm script: a browser tab per stack
# start is wrong for an agent and merely rude for a person.
#
# **To a log rather than to the bin**, and for the reason the build step above
# gives: a `> /dev/null` on something that can fail is a diagnosis thrown away.
# Not to the terminal either -- Storybook and Vite both rebuild on every save
# and interleaved output belongs to neither.
if [ "$WANT_STORYBOOK" = 1 ]; then
  SB_LOG="${TMPDIR:-/tmp}/incidentcompanion-storybook-$IC_STACK_SLOT.log"
  echo "==> Storybook on http://localhost:$STORYBOOK_PORT (the kit; log: $SB_LOG)"
  (cd "$UI_DIR" && STORYBOOK_PORT="$STORYBOOK_PORT" npm run --silent storybook \
    > "$SB_LOG" 2>&1) &
  SB_PID=$!
fi

# http here too, and for the reason the API URL above gives: a hop whose scheme
# disagrees with `AUTH_BASE_URL` breaks authentication silently.
echo "==> Vite on http://localhost:$VITE_PORT, proxying to Nest"
echo
echo "    Everything not yet built on the Node side will fail visibly."
echo "    Nest currently serves: /api/health and /api/auth/*"
echo

# INCIDENTCOMPANION_URL is what ui/vite.config.ts reads for its proxy target.
#
# **`--strictPort` and an explicit `--host`, and neither is tidiness**: Vite
# binds both address families by default, so two of them share a port number
# and serve different backends without warning.
#
# **`VITE_HOST` exists so an agent's stack can be looked at.** The default is
# loopback, which is right for a developer running this on the machine the
# browser is on. It is wrong for a container: your browser is outside
# it, and a loopback bind is unreachable from there -- so the answer was
# hand-typing an equivalent `npm run dev` beside this script, which is how the
# proxy target got lost and every API call came back 502 while the page loaded
# perfectly. One variable, and the script stays the only way in.
cd "$UI_DIR"
INCIDENTCOMPANION_URL="$API_URL" npm run dev -- \
  --port "$VITE_PORT" --strictPort --host "${VITE_HOST:-127.0.0.1}"
