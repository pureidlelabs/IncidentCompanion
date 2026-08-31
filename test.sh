#!/usr/bin/env bash
# Portable test runner for macOS and Linux.
# Creates a local .venv if it doesn't exist yet,
# installs test-only dependencies from requirements-dev.txt on top of it,
# and runs the e2e suite. Nothing is installed system-wide, no admin
# rights needed. Any extra arguments are passed straight through to
# pytest, e.g.:
#   ./test.sh -k evidence
#   ./test.sh -x -q
#
# `--browser` adds the Playwright tier, which is opt-in because it drives a
# stack this script does not start. Everything else is passed to pytest.
#   ./test.sh --browser
set -e
cd "$(dirname "$0")"

# **Asked for, never assumed.** `.venv/bin/python` was hardcoded here, and a
# worktree built on macOS makes that path exist while it cannot run -- see
# `scripts/venv_python.sh`, which builds one when there is none and hands back
# the main checkout's when this tree is a worktree.
VENV_PY="$(scripts/venv_python.sh --ensure)"

# --- Which tiers run --------------------------------------------------------
#
# **`--browser` is consumed here, never passed on.** Every other argument goes
# to pytest, so a flag this script owns has to be taken out of the list before
# it reaches one.
RUN_BROWSER=""
PYTEST_ARGS=()
for arg in "$@"; do
    case "$arg" in
        --browser) RUN_BROWSER=1 ;;
        *) PYTEST_ARGS+=("$arg") ;;
    esac
done
set -- "${PYTEST_ARGS[@]}"

"$VENV_PY" -m pip install --quiet -r requirements-dev.txt

# --- The frontend tier, before the Python suite -----------------------------
#
# **Nothing else runs `tsc` or vitest before landing** -- CI is `compileall`
# plus pytest, with no node. So one escape covers both halves and is named for
# both, and each half **fails loudly rather than skipping**: a check that
# silently does not run is the failure it exists to prevent.
#
# **`tsc -b`, never `tsc --noEmit`.** `ui/tsconfig.json` is a solution file, so
# bare `--noEmit` checks zero files and exits 0.
if [ -z "${INCIDENTCOMPANION_SKIP_UI:-}" ]; then
    # nvm installs node outside a non-interactive PATH, and its `npm` is a
    # symlink to a `#!/usr/bin/env node` script -- so a missing PATH entry
    # fails as a bare `command not found` rather than as a missing node.
    # Highest version wins: several are usually installed (20 and 24 here) and
    # nothing in the repo pins one -- no .nvmrc, no `engines` block.
    if ! command -v node >/dev/null 2>&1; then
        NEWEST_NODE=""
        for candidate in "$HOME"/.nvm/versions/node/*/bin; do
            [ -x "$candidate/node" ] || continue
            case "$NEWEST_NODE" in
                "") NEWEST_NODE="$candidate" ;;
                *)  [ "$(printf '%s\n%s\n' "$NEWEST_NODE" "$candidate" \
                        | sort -V | tail -1)" = "$candidate" ] \
                        && NEWEST_NODE="$candidate" ;;
            esac
        done
        [ -n "$NEWEST_NODE" ] && export PATH="$NEWEST_NODE:$PATH"
    fi

    if ! command -v node >/dev/null 2>&1; then
        echo "No node on PATH, so the frontend tier cannot run -- and it is"
        echo "the only thing that catches a TypeScript error before a container"
        echo "build does. Install node, or set INCIDENTCOMPANION_SKIP_UI=1"
        echo "to run the Python suite alone and accept the gap."
        exit 1
    fi

    # **The workspace root, not the package.** One `npm ci` at the root fills
    # both packages and hoists most of what they share, so which directory a
    # binary ends up in is npm's decision -- `typescript` differs by a major
    # between the two and one of them stays nested.
    if [ ! -d "node_modules" ]; then
        echo "node_modules is missing. Run npm ci at the repository root first,"
        echo "or set INCIDENTCOMPANION_SKIP_UI=1 to accept the gap."
        exit 1
    fi

    echo "Type-checking the frontend..."
    if ! npm run --silent --workspace ui typecheck; then
        echo ""
        echo "Frontend type check failed. The Python suite was not run -- a type"
        echo "error means the image does not build, whatever pytest reports."
        exit 1
    fi

    # --- The unit tier, because `tsc` proves it compiles, not that it works --
    #
    # **vitest needs Node 22+**, and under 20 it reports `Test Files no tests`
    # rather than a version error -- a green-looking nothing. The resolver
    # above takes the newest node installed, so this is checked, not assumed.
    NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
    if [ "$NODE_MAJOR" -lt 22 ]; then
        echo "node $NODE_MAJOR cannot run vitest -- its jsdom pool needs 22+ and"
        echo "fails as 'no tests' rather than as a version error. Install a newer"
        echo "node, or set INCIDENTCOMPANION_SKIP_UI=1 to accept the gap."
        exit 1
    fi

    # **No `--no-webstorage` here on purpose**: `test.execArgv` in
    # `ui/vite.config.ts` carries it, so no invocation site has to remember.
    echo "Running the frontend suite..."
    if ! npm run --silent --workspace ui test; then
        echo ""
        echo "Frontend suite failed. The Python suite was not run."
        exit 1
    fi
fi

echo "Running tests..."
# Parallel by default; each xdist worker is a separate process and
# `tests/conftest.py` mints a per-process scratch root. **`--dist loadfile`
# keeps a file's tests on one worker, and it masks a real order dependence
# rather than fixing it.** Both flags are pinned by
# `tests/repo/test_platform_portability.py`.
#
# Stand down for an explicit -n and for the flags wanting one readable stream:
# interleaved worker output defeats --pdb and -s entirely.
XDIST="-n auto --dist loadfile"
for arg in "$@"; do
    case "$arg" in
        -n*|--numprocesses*|--pdb|-s|--capture=no) XDIST="" ;;
    esac
done
"$VENV_PY" -m pytest tests $XDIST "$@"

# --- The browser tier, last and only when asked for -------------------------
#
# **Opt-in because it drives a running stack rather than starting one**, and
# because it is minutes rather than seconds. Last, so a cheaper tier fails
# first.
#
# **Its absence is printed.** A tier that silently does not run is the failure
# the halves above are written to prevent, and this one was exempt: without a
# built `ui/dist` its specs skip in silence, so a green `./test.sh` said
# nothing about it either way.
if [ -z "$RUN_BROWSER" ]; then
    echo ""
    echo "The browser tier was not run. ./test.sh --browser runs it."
    exit 0
fi

echo ""
echo "Building the client the browser tier serves..."
# **The tier drives the SPA the Nest server serves out of `ui/dist`, not the
# Vite dev server.** A stale bundle fails as though the app were broken rather
# than as a stale build -- measured 2026-08-19, seven specs failed that way and
# none of them was a defect.
if ! npm run --silent --workspace ui build; then
    echo ""
    echo "The client did not build, so the browser tier would drive whatever"
    echo "was last built. Not run."
    exit 1
fi

API_URL="$(node server/scripts/stack.mjs --json \
    | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).apiUrl')"

if ! curl -sf -o /dev/null "$API_URL/api/health"; then
    echo ""
    echo "Nothing is answering at $API_URL. The browser tier drives a running"
    echo "app rather than starting one -- run ./dev-node.sh in another shell,"
    echo "then ./test.sh --browser again."
    exit 1
fi

echo "Running the browser tier against $API_URL..."
(cd server && npx playwright test --config=e2e/playwright.config.ts)
