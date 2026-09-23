# shellcheck shell=bash
#
# Sourced by mise's `[env] _.source`. The path is relative because mise runs
# this from the directory holding `mise.toml`, not from the shell's.
#
# A mise shim for `node` is `mise exec`, which sources this file again before
# running node. The nested run inherits the guard and sets nothing; the unset
# keeps the guard out of what mise exports.
if [ -z "${IC_STACK_ENV_SOURCING:-}" ]; then
  export IC_STACK_ENV_SOURCING=1
  eval "$(node server/scripts/stack.mjs --export)"
  unset IC_STACK_ENV_SOURCING
fi
