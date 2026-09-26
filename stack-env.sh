# shellcheck shell=bash
#
# Sourced by mise's `[env] _.source`. The path is relative because mise runs
# this from the directory holding `mise.toml`, not from the shell's.
#
# A mise shim for `node` is `mise exec`, which sources this file again before
# running node. The nested run inherits the guard and sets nothing; the unset
# keeps the guard out of what mise exports.
#
# A shim runs under its caller's environment, so a name already set keeps its
# value: `DATABASE_URL="$IC_MIGRATE_DATABASE_URL" npm run db:push` reaches the
# schema step as the migrate role. mise undoes its own values on leaving a
# directory, so what it set for another worktree is never kept.
if [ -z "${IC_STACK_ENV_SOURCING:-}" ]; then
  export IC_STACK_ENV_SOURCING=1
  while IFS= read -r ic_line; do
    ic_name="${ic_line#export }"
    ic_name="${ic_name%%=*}"
    [ -n "${!ic_name+set}" ] || eval "$ic_line"
  done < <(node server/scripts/stack.mjs --export)
  unset IC_STACK_ENV_SOURCING ic_line ic_name
fi
