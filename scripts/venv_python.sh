#!/usr/bin/env bash
# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only
#
# Print the interpreter this tree runs its Python tools with. `--ensure` builds
# or repairs one first, so a caller can rely on the path it gets back.
#
#   PY="$(scripts/venv_python.sh --ensure)"
#
# **`.venv` existing is not evidence it runs** -- a worktree built on macOS
# carries one whose `bin/python` symlink dangles in the container. So every
# candidate is *executed*, never tested with `-f`.
#
# **A worktree falls back to the main checkout**, whose `.venv` is the
# Linux-native one. The consequence is shared: two trees running the suite at
# once install into one environment.
#
# **Nothing here falls back to the system interpreter.** It would run, and then
# `pip install -r requirements-dev.txt` would write the suite's dependencies
# into it -- system-wide, on an analyst's machine, from a test run.
set -uo pipefail

ensure=0
[ "${1:-}" = "--ensure" ] && ensure=1

runs() { [ -n "$1" ] && [ -x "$1" ] && "$1" -c '' >/dev/null 2>&1; }

tree_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
main_root="$tree_root"
common="$(git rev-parse --git-common-dir 2>/dev/null || true)"
if [ -n "$common" ]; then
    main_root="$(cd "$tree_root" && cd "$common/.." 2>/dev/null && pwd || echo "$tree_root")"
fi

for candidate in "$tree_root/.venv/bin/python" "$main_root/.venv/bin/python"; do
    if runs "$candidate"; then
        echo "$candidate"
        exit 0
    fi
done

if [ "$ensure" -eq 0 ]; then
    echo "No usable .venv for $tree_root (nor in $main_root). Run ./test.sh, or" >&2
    echo "scripts/venv_python.sh --ensure, to build one." >&2
    exit 1
fi

# Build in *this* tree, not the main checkout: `--ensure` reaching sideways
# would repair a directory the caller never named, and it is the fallback
# every other worktree shares.
target="$tree_root/.venv"
bootstrap=""
for candidate in python3 python; do
    command -v "$candidate" >/dev/null 2>&1 && { bootstrap="$candidate"; break; }
done
if [ -z "$bootstrap" ]; then
    echo "No Python interpreter on PATH. Install Python 3.10+ and re-run." >&2
    exit 1
fi

# **`--clear` when the directory is already there**, because a foreign venv is
# not repaired by writing new symlinks over it: `lib/` still holds macOS wheels
# whose extension modules this kernel cannot load, and the import error names
# the package rather than the environment. Emptying is the honest repair, and
# `.venv` is regenerable by definition.
if [ -d "$target" ]; then
    echo "==> .venv in $tree_root cannot run; rebuilding it" >&2
    "$bootstrap" -m venv --clear "$target" >&2 || exit 1
else
    echo "==> building .venv in $tree_root" >&2
    "$bootstrap" -m venv "$target" >&2 || exit 1
fi

# A rebuilt environment is empty, and every caller of this script is about to
# use it for something that needs the dependencies. `test.sh` installs them on
# every run anyway; this is what makes the *other* callers whole.
if [ -f "$tree_root/requirements-dev.txt" ]; then
    "$target/bin/python" -m pip install --quiet --upgrade pip >&2
    "$target/bin/python" -m pip install --quiet -r "$tree_root/requirements-dev.txt" >&2
fi

if runs "$target/bin/python"; then
    echo "$target/bin/python"
    exit 0
fi

echo "Built $target and its interpreter still does not run." >&2
exit 1
