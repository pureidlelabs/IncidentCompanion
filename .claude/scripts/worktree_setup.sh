#!/usr/bin/env bash
#
# Make a fresh worktree runnable: dependencies, then its own stack.
#
# **A worktree starts with no `node_modules` at all**, so the first
# thing anyone does in one is discover that - usually by running the suite and
# reading a `Cannot find package 'vitest'` from inside a vite config, which
# reads as a broken checkout rather than a missing install. One `npm ci` at the
# root and a `db:up` is the whole of it; this is those, and the stack waits on
# the install, so it is one command instead of three and a guess about order.
#
# **The install runs, then the stack.** It has to - `stack.mjs` imports
# `proper-lockfile` to claim this worktree's slot, so it cannot run until the
# root `node_modules` exists.
#
# **`--no-ui` trims the install to the server workspace.** Nothing in the
# server suite needs the client tree, and a backend-only session should not pay
# ~438MB for it - but it is needed to typecheck the client or build `ui/dist`
# for the browser tier, and finding that out later costs more than the flag.
#
#     .claude/scripts/worktree_setup.sh              # server + ui + stack
#     .claude/scripts/worktree_setup.sh --no-ui      # skip the client install
#     .claude/scripts/worktree_setup.sh --no-stack   # containers already up
#
# Safe to re-run: `npm ci` is idempotent by definition and `db:up` waits on
# containers that are already healthy.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WITH_UI=1
WITH_STACK=1

for arg in "$@"; do
  case "$arg" in
    --no-ui) WITH_UI=0 ;;
    --no-stack) WITH_STACK=0 ;;
    -h|--help) sed -n '3,27p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

LOGS="$(mktemp -d)"
trap 'rm -rf "$LOGS"' EXIT

# **Started in the background and waited on by pid**, rather than `&&`-chained:
# the point is that they overlap. Each writes its own log so a failure names
# which one failed instead of interleaving three outputs.
declare -a NAMES=()
declare -a PIDS=()

start() {
  local name="$1"; shift
  echo "  starting $name"
  ( "$@" ) > "$LOGS/$name.log" 2>&1 &
  NAMES+=("$name")
  PIDS+=("$!")
}

echo "Setting up $(basename "$ROOT")"

# **One install for both packages.** The root is a workspace, so `npm ci` here
# fills `server/` and `ui/` from one lockfile.
#
# `--no-ui` trims it to `--workspace server`, and the client tree (~438MB) is
# what that saves a backend-only session. The server's own build still reads
# `server/src/domain` and nothing there imports a client-only package, so the
# server workspace resolves on its own; `@contract` runs the other way (the
# client reading the server), which `--no-ui` does not build.
if [ "$WITH_UI" -eq 1 ]; then
  start deps npm --prefix "$ROOT" ci
else
  start deps npm --prefix "$ROOT" ci --workspace server
fi

# **The stack needs the install before it can run**, because `stack.mjs`
# imports `proper-lockfile` to claim its slot. So it waits rather than starting
# beside it - the one ordering constraint in here, and it is not obvious from
# the outside.
FAILED=0
for i in "${!PIDS[@]}"; do
  if ! wait "${PIDS[$i]}"; then
    echo "FAILED: ${NAMES[$i]}" >&2
    tail -15 "$LOGS/${NAMES[$i]}.log" >&2
    FAILED=1
  else
    echo "  done ${NAMES[$i]}"
  fi
done

[ "$FAILED" -ne 0 ] && exit 1

if [ "$WITH_STACK" -eq 1 ]; then
  echo "  starting stack"
  if ! (cd "$ROOT/server" && npm run db:up) > "$LOGS/stack.log" 2>&1; then
    echo "FAILED: stack" >&2
    tail -15 "$LOGS/stack.log" >&2
    exit 1
  fi
  echo "  done stack"
fi

echo
echo "Ready. Run the suite with no environment at all:"
echo "  cd server && npm run check"
echo
# **Said because it is not guessable and cost a whole session of typing.** The
# harness derives this worktree's stack from `stack.mjs` when the environment
# is silent, so exporting anything is unnecessary for the suite. What needs the
# exports is a tool that takes a URL of its own - `drizzle-kit`, `psql`.
echo "For a tool that wants its own URL (drizzle-kit, psql):"
echo "  eval \"\$(node $ROOT/server/scripts/stack.mjs --export)\""
echo
echo "This worktree's ports:"
node "$ROOT/server/scripts/stack.mjs"
