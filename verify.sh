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
# **Three questions, three costs.** A sweep nobody runs proves nothing, and the
# old `--quick` skipped only the browser tier -- so the fast mode built
# containers and took twenty minutes.
#
#   ./verify.sh --quick     is it well-formed?      static analysis only, ~1 min
#   ./verify.sh             did I break behaviour?  + builds and the suites
#   ./verify.sh --detailed  would it survive CI?    + containers and the browser
#
# `--detailed` starts the services the suites need, because the alternative is
# a mode that asks the expensive question and answers it against the in-process
# engine. It leaves them running: stopping a stack somebody else started is the
# worse surprise, and the summary names them.
#
set -uo pipefail
# `|| exit` is load-bearing: there is deliberately no `-e` here, because a
# failing tier has to be collected rather than abort the run. That makes a
# failed `cd` silent -- every tier below would then verify whichever directory
# the caller happened to be standing in, and this is the command that decides
# whether the product was tested at all.
cd "$(dirname "$0")" || exit 1

MODE=default
for arg in "$@"; do
  case "$arg" in
    --quick) MODE=quick ;;
    --detailed) MODE=detailed ;;
    *) printf 'unknown flag: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

# Does this mode run the tiers that execute something?
behaviour() { [ "$MODE" != quick ]; }
# Does it run the ones that need a container built or a browser driven?
expensive() { [ "$MODE" = detailed ]; }

FAILED=()
SKIPPED=()
PASSED=()
# A tier that ran but could not cover everything it names. Distinct from a skip,
# which ran nothing, and from a failure, which found something.
PARTIAL=()
# Containers this run brought up and is deliberately leaving behind.
STARTED_SERVICES=0

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
# **The suite has two tiers and only one of them covers the write paths.**
# With no daemon `global-setup.ts` starts PGlite in-process, and the suite says
# so in its first line: the writes that need two concurrent transactions cannot
# pass against one backend. Those failures are the tier, not a defect -- so the
# verdict depends on which tier ran, and calling the degraded one FAILED is an
# environment gap reported as a defect. -> `server/test/global-setup.ts`
#
# **The suite runs either way.** Withholding it because the stack is down would
# trade the 3200-odd tests that do cover this branch for nothing.
# One `stack.mjs` run for both this and the browser tier below: each spawns
# node and two `git rev-parse`.
STACK_JSON="$(cd server && node scripts/stack.mjs --json)"
# **Started before the ports are read, so the probe below sees them.** Only in
# `--detailed`, and only the services -- the browser tier also wants the app,
# which is `./dev-node.sh`'s watch loop rather than anything this script owns.
if expensive; then
  printf '\n\033[1m== starting the services (--detailed)\033[0m\n'
  if (cd server && node scripts/stack.mjs --compose up -d --wait postgres redis) \
     && (cd server && node scripts/stack.mjs --roles) \
     && eval "$(node server/scripts/stack.mjs --export)" \
     && DATABASE_URL="$IC_MIGRATE_DATABASE_URL" \
        bash -c 'cd server && npm run --silent db:push -- --force' >/dev/null; then
    STARTED_SERVICES=1
  else
    SKIPPED+=("the services could not be started; the suites fall back to the in-process engine")
  fi
fi
port_of() { printf '%s' "$STACK_JSON" | sed -n "s/.*\"$1\": \([0-9]*\).*/\1/p"; }
REDIS_PORT="$(port_of redisPort)"
PG_PORT="$(port_of pgPort)"
# Both, because Postgres alone leaves every booted-app file failing on Redis and
# Redis alone leaves the write paths on the embedded engine.
if ! behaviour; then
  :
elif [ -n "$REDIS_PORT" ] && [ -n "$PG_PORT" ] \
   && reachable 127.0.0.1 "$PG_PORT" && reachable 127.0.0.1 "$REDIS_PORT"; then
  # **`IC_SUITE_MUST_RUN` here and not at the top of the script.** The branch
  # below runs the same suite deliberately degraded and reports it as such, so
  # setting this globally would turn that considered fallback into a failure.
  # Here the stack was found, which is the one case where a suite that declines
  # anyway is telling us something -- a partly-raised stack, or a run that never
  # reached the tests it thinks it ran. -> `server/test/must-run.ts`
  step "server: suite" bash -c 'cd server && IC_SUITE_MUST_RUN=1 npx vitest run --pool=threads'
elif bash -c 'cd server && npx vitest run --pool=threads'; then
  # Green on the embedded engine is a real pass of everything it can reach.
  PASSED+=("server: suite (in-process engine -- the write paths were not covered)")
else
  PARTIAL+=("server: suite ran on the in-process engine and some of it failed there.
            The write paths need two concurrent transactions and cannot pass
            against one backend. Start the dev stack and run this again before
            reading those failures as yours: ./dev-node.sh")
fi
behaviour && step "server: build" bash -c 'cd server && npm run --silent build'

# ------------------------------------------------------------------- ui
# **`-b`, and `--force` so a stale `.tsbuildinfo` cannot report a clean tree.**
# `ui/tsconfig.json` is a solution file, so without `-b` tsc follows no
# reference and checks nothing.
step "client: typecheck" bash -c 'cd ui && npx tsc -b --noEmit --force'
# The server has had a lint step since its own flat config landed and the
# client never did, so `ui` was linted by nothing here - an error sat on the
# release branch unseen.
step "client: lint" bash -c 'cd ui && npm run --silent lint'
behaviour && step "client: suite" bash -c 'cd ui && npx vitest run'

# ------------------------------------------------------- repository checks
# **`tests/docker` builds containers**, which is the whole reason a full sweep
# ran past twenty minutes -- `test.sh` runs `pytest tests` unqualified and the
# everyday selection excludes it. It is the expensive question, so it is asked
# in the expensive mode. -> `CLAUDE.md`
if expensive; then
  # The mode that just started containers is the mode where "no docker on
  # PATH" is a broken run rather than a machine without Docker.
  step "repository: suite (with the container files)" env IC_SUITE_MUST_RUN=1 ./test.sh -q
elif behaviour; then
  step "repository: suite" ./test.sh -q --ignore=tests/docker
  SKIPPED+=("tests/docker -- builds containers; ./verify.sh --detailed runs it")
fi

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
if ! behaviour; then
  :
elif [ -x "$VENV" ]; then
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
if ! expensive; then
  SKIPPED+=("browser tier (./verify.sh --detailed runs it)")
elif [ -z "$API_PORT" ]; then
  SKIPPED+=("browser tier (could not derive this worktree's port)")
elif reachable 127.0.0.1 "$API_PORT"; then
  step "browser tier" bash -c 'cd server && npx playwright test --config=e2e/playwright.config.ts'
else
  SKIPPED+=("browser tier (nothing listening on $API_PORT - start ./dev-node.sh)")
fi

# ----------------------------------------------------------------- said
printf '\n\033[1m== what ran (%s)\033[0m\n' "$MODE"
for one in "${PASSED[@]:-}"; do [ -n "$one" ] && printf '  \033[32mpassed\033[0m  %s\n' "$one"; done
for one in "${SKIPPED[@]:-}"; do [ -n "$one" ] && printf '  \033[33mskipped\033[0m %s\n' "$one"; done
for one in "${PARTIAL[@]:-}"; do [ -n "$one" ] && printf '  \033[33mPARTIAL\033[0m %s\n' "$one"; done
for one in "${FAILED[@]:-}"; do [ -n "$one" ] && printf '  \033[31mFAILED\033[0m  %s\n' "$one"; done

if [ "$STARTED_SERVICES" = 1 ]; then
  printf '\nPostgres and Redis were started by this run and are still up.\n'
  printf '  node server/scripts/stack.mjs --compose down\n'
fi
if [ "${#FAILED[@]}" -gt 0 ]; then
  printf '\n%s tier(s) failed.\n' "${#FAILED[@]}"
  exit 1
fi
if [ "${#PARTIAL[@]}" -gt 0 ]; then
  printf '\n%s tier(s) ran without covering everything they name. Nothing failed.\n' "${#PARTIAL[@]}"
  exit 0
fi
printf '\nEvery tier that could run, ran.\n'
