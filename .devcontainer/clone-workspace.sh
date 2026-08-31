#!/usr/bin/env sh
# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only
#
# Runs as `onCreateCommand`, baked into the image at
# /usr/local/bin/ic-clone-workspace.sh rather than read from the workspace --
# the workspace is the volume this script fills, and does not exist yet.
# → `.devcontainer/README.md`
set -eu

# --- Copying this file to another project: edit only these four lines. ----
# The rest of this script, and everything else under .devcontainer/, is
# reusable as-is -- see the README section this points at for what else
# needs a look. → `.devcontainer/README.md`, "Copying this to another project"
REPO_URL="git@github.com:pureidlelabs/IncidentCompanion.git"
BRANCH="main"
# Left empty on purpose. Hard-coding a name here in a file that invites being
# copied means whoever copies it authors commits as somebody else until they
# notice. Empty falls through to the container's own git config, which is the
# identity of whoever is actually working. Set them only to override that.
GIT_NAME=""
GIT_EMAIL=""
# ----------------------------------------------------------------------------

TARGET="$PWD"

# Docker creates a named volume owned by root. Non-recursive: it is empty.
sudo chown "$(id -u):$(id -g)" "$TARGET"

# This runs before post-start.sh, which is where ~/.ssh normally gets made --
# so an unknown host key here would block on an interactive prompt this
# lifecycle command has no terminal to answer. Recording the key via
# `ssh-keyscan` on first contact still refuses a *changed* one on every later
# connection, which `StrictHostKeyChecking=no` would not -- that setting stays
# banned per README.md. The gap this does not close: a poisoned answer to
# *this* keyscan is trusted from then on. Accepted for a laptop's own first
# outbound connection to GitHub; not a defense against a hostile network.
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
touch "$HOME/.ssh/known_hosts"
if ! grep -q "^github.com " "$HOME/.ssh/known_hosts" 2>/dev/null; then
    ssh-keyscan -t ed25519,rsa github.com >> "$HOME/.ssh/known_hosts" 2>/dev/null || true
fi

if [ -d "$TARGET/.git" ]; then
    echo "==> $TARGET is already a checkout, fetching $BRANCH"
    # A fetch failing (offline, agent not yet loaded on a rebuild) must not
    # abort onCreateCommand: the clone this volume already holds is complete,
    # and failing here would skip postCreateCommand on a workspace that needs
    # nothing from it.
    git -C "$TARGET" fetch origin "$BRANCH" || echo "==> fetch skipped"
else
    if ! ssh-add -l >/dev/null 2>&1; then
        echo "======================================================================"
        echo " No SSH identity is available yet, so the initial clone cannot"
        echo " authenticate to GitHub. On the Mac: ssh-add --apple-use-keychain,"
        echo " then reopen the container. See README.md, 'Let git clone and push sign'."
        echo "======================================================================"
        exit 1
    fi
    git clone --branch "$BRANCH" "$REPO_URL" "$TARGET"
fi

# A fresh clone carries no local identity, so git falls back to whatever
# global ~/.gitconfig the container seeded from the host. That is the right
# answer for whoever is working, so it is only overridden when the two lines
# above name something -- and setting an empty value is worse than setting
# nothing, because git accepts it and then refuses to commit.
#
# `[ -n "$x" ] && cmd` would end the script here rather than skip the line:
# under `set -e` the chain's exit status is the test's, and an empty value
# makes that a failure.
if [ -n "$GIT_NAME" ]; then
  git -C "$TARGET" config user.name "$GIT_NAME"
fi
if [ -n "$GIT_EMAIL" ]; then
  git -C "$TARGET" config user.email "$GIT_EMAIL"
fi

# Per-clone and unversioned, so nothing else sets it on a fresh checkout.
# Without it, `git push . wt/feature:dev` -- the worktree landing path
# `rules/git-workflow.md` documents as the default -- fails with "refusing to
# update checked out branch" in every container built from this image.
git -C "$TARGET" config receive.denyCurrentBranch updateInstead
