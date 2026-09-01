# shellcheck shell=bash
#
# Sourced by mise's `[env] _.source`. The path is relative because mise runs
# this from the directory holding `mise.toml`, not from the shell's.
eval "$(node server/scripts/stack.mjs --export)"
