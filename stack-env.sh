# shellcheck shell=bash
#
# The dev stack's addresses, as shell exports. Sourced by mise's `[env]
# _.source` in `mise.toml`, and run by nothing else.
#
# mise runs this from the directory holding `mise.toml` rather than from
# wherever the shell stands, so the relative path is resolved against the
# repository root and holds for a shell in any subdirectory.
eval "$(node server/scripts/stack.mjs --export)"
