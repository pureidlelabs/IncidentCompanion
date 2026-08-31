#!/usr/bin/env sh
# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only
#
# Runs on the **Mac**, before anything is mounted (`initializeCommand`). That is
# the only moment a missing bind source can still be fixed: Docker does not
# refuse one, it creates it as a root-owned empty directory, and the failure
# then arrives as the app or Claude Code being broken.
#
# Nothing here reads or copies anything. It only guarantees the sources exist.
set -u

# The app's data root. `settings.py` resolves `Path.home() / "incidentcompanion"`
# and the container binds it; without this the container gets a root-owned
# directory and dies on `PermissionError: /home/vscode/incidentcompanion`.
mkdir -p "$HOME/incidentcompanion"

# **The Claude config paths seeded into the container on first start.**
# Bound read-only at `/mnt/host-claude/`, copied once by `post-start.sh`. Each
# is named individually rather than binding `~/.claude` whole, which is the
# whole point: `projects/`, `history.jsonl`, `todos/` and `security/` are *not*
# on this list and stay on the Mac.
#
# Creating an absent one as an empty directory is deliberate -- an empty bind
# source is harmless and copies nothing, where a missing one stops the
# container from starting at all.
for d in rules plugins agents commands skills output-styles; do
    mkdir -p "$HOME/.claude/$d"
done

# **The one path under `projects/` that is shared**, and bound rather than
# seeded, so a memory written in the container reaches the Mac. A first-ever
# session on this machine has not created it yet, and a bind of a missing
# source is the failure above.
#
# **The directory is keyed on the checkout path with every slash as a dash**,
# so it is different on every machine and cannot be written down here. This
# script runs on the Mac in the workspace, so `$PWD` is that path -- and a
# hardcoded one would silently bind somebody else's memory to a directory
# named after a repository they have never had, `mkdir -p` creating it rather
# than failing.
PROJECT_KEY="$(printf '%s' "$PWD" | tr '/' '-')"
mkdir -p "$HOME/.claude/projects/$PROJECT_KEY/memory"

# `devcontainer.json` cannot transform a string, so it binds one fixed name and
# this points that name at whichever directory this checkout actually uses.
# `-n` so a re-run replaces the link rather than nesting one inside it.
ln -sfn "$HOME/.claude/projects/$PROJECT_KEY/memory" "$HOME/.claude/ic-project-memory"

# `settings.json` is a *file*, so `mkdir -p` cannot stand in for it and a bind
# of a missing file is the failure above. `{}` is a valid no-op settings file
# and is what Claude Code would write itself; it is created only when absent,
# so an existing one is never touched.
if [ ! -e "$HOME/.claude/settings.json" ]; then
    mkdir -p "$HOME/.claude"
    printf '{}\n' > "$HOME/.claude/settings.json"
fi

exit 0
