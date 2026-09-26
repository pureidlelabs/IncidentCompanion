# shellcheck shell=bash
#
# Sourced by mise's `[env] _.source`. The path is relative because mise runs
# this from the directory holding `mise.toml`, not from the shell's.
#
# A mise shim for `node` is `mise exec`, which sources this file again before
# running node. The nested run inherits the guard and sets nothing; the unset
# keeps the guard out of what mise exports.
#
# A shim runs under its caller's environment. A caller already on this stack
# keeps the values it set, such as an inline `DATABASE_URL`; any other has
# every value replaced.
if [ -z "${IC_STACK_ENV_SOURCING:-}" ]; then
  export IC_STACK_ENV_SOURCING=1
  ic_exports="$(node server/scripts/stack.mjs --export)" || ic_exports=
  ic_keep=
  case "$ic_exports" in
    *"export IC_COMPOSE_PROJECT='${IC_COMPOSE_PROJECT:-}'"*) [ -n "${IC_COMPOSE_PROJECT:-}" ] && ic_keep=1 ;;
  esac
  while IFS= read -r ic_line; do
    ic_name="${ic_line#export }"
    ic_name="${ic_name%%=*}"
    [ -n "$ic_name" ] || continue
    [ -n "$ic_keep" ] && [ -n "${!ic_name:-}" ] || eval "$ic_line"
  done <<< "$ic_exports"
  unset IC_STACK_ENV_SOURCING ic_exports ic_keep ic_line ic_name
fi
