#!/usr/bin/env bash
#
# Every tier, in one command, failing on any of them.
#
# **One entry point, because the tiers are otherwise run by whoever remembers
# which.** The Python tier is `./test.sh`, the server and the client each have
# a typecheck and a suite, and the browser tier is separate again.
#
# **A skipped tier is stated rather than counted as a pass** -- some skip
# rather than fail when a service is absent, which is worse than failing.
#
#   ./verify.sh            everything that can run here
#   ./verify.sh --quick    everything except the browser tier
#
set -uo pipefail
# `|| exit` is load-bearing: there is deliberately no `-e` here, because a
# failing tier has to be collected rather than abort the run. That makes a
# failed `cd` silent -- every tier below would then verify whichever directory
# the caller happened to be standing in, and this is the command that decides
# whether the product was tested at all.
cd "$(dirname "$0")" || exit 1

QUICK=0
[ "${1:-}" = "--quick" ] && QUICK=1

FAILED=()
SKIPPED=()
PASSED=()

step() {
  local name="$1"; shift
  printf '\n\033[1m== %s\033[0m\n' "$name"
  if "$@"; then
    PASSED+=("$name")
  else
    FAILED+=("$name")
  fi
}

reachable() {
  "$(command -v python3 || command -v python)" - "$1" "$2" <<'PY' 2>/dev/null
import socket, sys
s = socket.socket(); s.settimeout(1.5)
try:
    s.connect((sys.argv[1], int(sys.argv[2])))
except Exception:
    sys.exit(1)
finally:
    s.close()
PY
}

# ---------------------------------------------------------------- server
step "server: typecheck (source and tests)" bash -c 'cd server && npm run --silent typecheck'
# Its own flat config, which the root's `lint:ascii` cannot load: passing
# `--config` explicitly turns off directory discovery, so `server/` was linted
# by nothing until this line existed.
step "server: lint" bash -c 'cd server && npm run --silent lint'
# **The server suite passes with the stack down and tests almost nothing.**
# 42 of its files are `describe.skipIf(!bootable())`, and `bootable()` is false
# with no Redis listening -- among them `analyst-privilege.test.ts`, which is
# the whole authorisation model. A skipped tier is stated here rather than
# counted as a pass, and this is the tier that breaks that rule quietly.
# One `stack.mjs` run for both this and the browser tier below: each spawns
# node and two `git rev-parse`.
STACK_JSON="$(cd server && node scripts/stack.mjs --json)"
port_of() { printf '%s' "$STACK_JSON" | sed -n "s/.*\"$1\": \([0-9]*\).*/\1/p"; }
REDIS_PORT="$(port_of redisPort)"
step "server: suite" bash -c 'cd server && npx vitest run --pool=threads'
if [ -z "$REDIS_PORT" ]; then
  # **Silence here would be the failure this block exists to prevent.** With no
  # port the guard below never fires, the suite reports a pass, and 42 files
  # skipped without a word.
  SKIPPED+=("server: the database-backed files -- stack.mjs gave no port, so nothing was checked")
elif ! reachable 127.0.0.1 "$REDIS_PORT"; then
  SKIPPED+=("server: the database-backed files -- no stack on 127.0.0.1:$REDIS_PORT")
fi
step "server: build" bash -c 'cd server && npm run --silent build'

# ------------------------------------------------------------------- ui
# **`-b`, and `--force` so a stale `.tsbuildinfo` cannot report a clean tree.**
# `ui/tsconfig.json` is a solution file, so without `-b` tsc follows no
# reference and checks nothing.
step "client: typecheck" bash -c 'cd ui && npx tsc -b --noEmit --force'
# The server has had a lint step since its own flat config landed and the
# client never did, so `ui` was linted by nothing here - an error sat on the
# release branch unseen.
step "client: lint" bash -c 'cd ui && npm run --silent lint'
step "client: suite" bash -c 'cd ui && npx vitest run'

# ------------------------------------------------------- repository checks
# The client-and-repository tier: `tests/` plus the checks on this repo itself.
step "repository: suite" ./test.sh -q

# ------------------------------------------------------------------ hooks
# **A worktree has no `.venv`**, and skipping on that alone meant this tier was
# never run in the only place a branch is ever built - so four failures sat at
# head unseen, three of them caused by files the branch deleted. Borrow the
# main checkout's interpreter and run it against *this* tree: "run it from the
# main checkout" is an answer about a different commit.
VENV=.venv/bin/python
if [ ! -x "$VENV" ]; then
  VENV="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/.venv/bin/python"
fi
if [ -x "$VENV" ]; then
  step "hooks and guidance" "$VENV" -m pytest .claude/tests -q
else
  SKIPPED+=("hooks and guidance (no .venv found, here or beside the repository)")
fi

# ----------------------------------------------------------------- prose
# **The tier `codebase-structure.md` said this script ran, and it did not.**
# Vale is in neither `./test.sh` nor CI, so a claim that "verify.sh runs all of
# them" over a table with a prose row left this the one row nothing covered.
# It skips rather than fails when the binary is absent: the devcontainer pins
# it, a Mac may not have it, and a missing linter is not a red tier.
if command -v vale >/dev/null 2>&1; then
  step "prose lint" bash -c 'npm run --silent lint:prose'
else
  SKIPPED+=("prose lint (no vale on PATH - brew install vale)")
fi

# ----------------------------------------------------------------- shell
# Same skip-rather-than-fail shape as the prose tier, and the same reason: the
# devcontainer pins it, a Mac may not have it. **It found this script's own
# `cd` bug** -- unguarded under a deliberate `set -uo` with no `-e`, so a
# failed `cd` verified the wrong tree and exited 0.
if command -v shellcheck >/dev/null 2>&1; then
  step "shell lint" bash -c 'npm run --silent lint:shell'
else
  SKIPPED+=("shell lint (no shellcheck on PATH - brew install shellcheck)")
fi

# --------------------------------------------------------------- workflows
# **A YAML parser passes a broken workflow.** The expressions inside `${{ }}`
# and the shell inside `run:` are opaque to it, so the failure arrives as a
# push that GitHub refuses to start. `actionlint` reads both.
if command -v actionlint >/dev/null 2>&1; then
  step "workflow lint" bash -c 'npm run --silent lint:actions'
else
  SKIPPED+=("workflow lint (no actionlint on PATH - brew install actionlint)")
fi

# --------------------------------------------------------------- renovate
# **The dependency policy is a program, and a broken one fails silently.** A
# malformed rule matches nothing, and Renovate reports a clean run having
# skipped it. `--no-global` is what makes this a repository config rather than a
# self-hosted global one, which is validated against a different schema and
# accepts almost anything.
#
# Needs the network, unlike the linters above, so it declines the same way they
# do rather than failing the tier offline.
if npx --yes --package renovate@latest -- renovate-config-validator --version >/dev/null 2>&1; then
  step "renovate config" bash -c 'npm run --silent lint:renovate'
else
  SKIPPED+=("renovate config (cannot reach the npm registry)")
fi

# --------------------------------------------------------------- browser
# **Needs a server it can reach**, and says so rather than passing empty.
# **The port is derived, never the literal 8124** -- a literal gate fires off
# the main checkout's server while Playwright drives the worktree's.
API_PORT="$(port_of apiPort)"
if [ "$QUICK" = "1" ]; then
  SKIPPED+=("browser tier (--quick)")
elif [ -z "$API_PORT" ]; then
  SKIPPED+=("browser tier (could not derive this worktree's port)")
elif reachable 127.0.0.1 "$API_PORT"; then
  step "browser tier" bash -c 'cd server && npx playwright test --config=e2e/playwright.config.ts'
else
  SKIPPED+=("browser tier (nothing listening on $API_PORT - start ./dev-node.sh)")
fi

# ----------------------------------------------------------------- said
printf '\n\033[1m== what ran\033[0m\n'
for one in "${PASSED[@]:-}"; do [ -n "$one" ] && printf '  \033[32mpassed\033[0m  %s\n' "$one"; done
for one in "${SKIPPED[@]:-}"; do [ -n "$one" ] && printf '  \033[33mskipped\033[0m %s\n' "$one"; done
for one in "${FAILED[@]:-}"; do [ -n "$one" ] && printf '  \033[31mFAILED\033[0m  %s\n' "$one"; done

if [ "${#FAILED[@]}" -gt 0 ]; then
  printf '\n%s tier(s) failed.\n' "${#FAILED[@]}"
  exit 1
fi
printf '\nEvery tier that could run, ran.\n'
