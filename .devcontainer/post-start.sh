#!/usr/bin/env bash
# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only
#
# Runs on every container start. Ownership problems that cannot be solved in
# the image, because a volume outlives a container and a feature runs after the
# Dockerfile. **Nothing here may `chown` something that lives on the Mac.**
set -uo pipefail

# --- 1. The docker socket -------------------------------------------------
#
# **The group is granted at create, in `clone-workspace.sh`.** Nothing to do
# here but say so when it did not arrive.
#
# `usermod -aG` stood here and could not work: a process's supplementary groups
# are fixed when it starts, so granting them after the editor's server is
# running reaches nothing that server forks -- which is every terminal and
# every agent. `/etc/group` then says yes while every call says `permission
# denied ... docker.sock`, which reads as a dead daemon.
#
# Loud rather than repaired. Repairing here is what hid the create-time failure
# for months, and it would hide it again.
if [ -S /var/run/docker.sock ]; then
    SOCK_GID="$(stat -c %g /var/run/docker.sock)"
    if ! id -G | tr ' ' '\n' | grep -qx "$SOCK_GID"; then
        printf '\n\033[31mThe docker socket is group %s and this session does not hold it.\033[0m\n' "$SOCK_GID"
        printf 'Every docker call will fail with `permission denied`, which reads as a dead daemon.\n'
        if getent group "$SOCK_GID" | grep -q "\b$(id -un)\b"; then
            printf 'The group is granted, so this session simply predates it: rebuild the container.\n\n'
        else
            printf 'It is granted at create by clone-workspace.sh, and did not happen here.\n'
            printf 'Rebuild the container; if that does not fix it, that script is the place to look.\n\n'
        fi
    fi
fi

# --- 2. The named volumes -------------------------------------------------
#
# Docker creates a named volume owned by root, so each is unwritable until the
# mountpoint is handed over. Non-recursive on purpose: only the mountpoint is
# root-owned. The workspace volume itself is chowned by `clone-workspace.sh`
# (`onCreateCommand`), which runs first and needs to write into it.
#
# `projects/-workspace` is on the list because the memory bind lands inside it:
# Docker creates a mount's missing parents as root, and Claude Code writes this
# session's own transcript there.
for d in "$HOME/.claude" "$HOME/.ssh" \
         "$HOME/.claude/projects" "$HOME/.claude/projects/-workspace"; do
    [ -d "$d" ] && [ ! -w "$d" ] && sudo chown "$(id -u):$(id -g)" "$d"
done

# --- 3. The Python environment ---------------------------------------------
#
# **Here as well as in `post-create.sh`**, because a `.venv` volume recreated
# after the create hook comes back empty with nothing left to fill it -- which
# presents as `./test.sh` dying on a missing interpreter in a checkout that
# looks complete. `--ensure` is a no-op in the normal case, and repairs rather
# than reports because nobody is here to read a report.
if [ -x scripts/venv_python.sh ]; then
    scripts/venv_python.sh --ensure >/dev/null || \
        echo "==> WARNING: no usable .venv, and it could not be built" >&2
fi

# --- 4. Seed the Claude config from the Mac, once ----------------------------
#
# **The config directory is a volume, so it starts empty** -- that is what keeps
# the credential inside Docker, and the price is that the Mac's global `rules/`,
# `plugins/` and `settings.json` do not apply. `/mnt/host-claude/` is a
# read-only bind of exactly those paths and not of `~/.claude`, so sessions and
# history are not readable here at all.
#
# **`cp -n` and the marker, so the container's config is its own** rather than a
# mirror that re-asserts itself: a rule edited in here is never reverted to the
# Mac's copy on the next start.
SEEDED="$HOME/.claude/.seeded-from-host"

seed_tree() {
    # Skip an empty directory: `host-init.sh` creates absent ones so the bind
    # resolves, so "exists" does not imply "has anything in it".
    [ -d "$1" ] && [ -n "$(ls -A "$1" 2>/dev/null)" ] || return 0
    mkdir -p "$2"
    cp -Rn "$1/." "$2/" 2>/dev/null
}

if [ -d /mnt/host-claude ] && [ -d "$HOME/.claude" ] && [ ! -f "$SEEDED" ]; then
    for entry in rules agents commands skills output-styles; do
        seed_tree "/mnt/host-claude/$entry" "$HOME/.claude/$entry"
    done

    # **The two payload trees only, never the manifests beside them**, which
    # record absolute host paths and point every plugin at nothing.
    for tree in cache marketplaces; do
        seed_tree "/mnt/host-claude/plugins/$tree" "$HOME/.claude/plugins/$tree"
    done

    # settings.json is a file, and `{}` is what host-init.sh writes when the
    # Mac had none -- copying that over an empty volume is harmless.
    [ -f /mnt/host-claude/settings.json ] \
        && cp -n /mnt/host-claude/settings.json "$HOME/.claude/settings.json" 2>/dev/null

    # The marker records *that* it ran, so a later start does not re-copy even
    # if everything was subsequently deleted in here on purpose.
    date -u +"seeded %Y-%m-%dT%H:%M:%SZ" > "$SEEDED" 2>/dev/null
    echo "==> seeded ~/.claude from the Mac (rules, plugins, agents, commands, skills, settings)"
fi

# --- 5. Signing, through the Mac's agent and never a key in here -------------
#
# **No private key is created in this container and none is copied in** -- the
# Mac's forwarded agent does the signing, and refusing is deliberate rather
# than a gap.
agent_can_sign() {
    [ -n "${SSH_AUTH_SOCK:-}" ] && [ -S "${SSH_AUTH_SOCK}" ] \
        && ssh-add -l >/dev/null 2>&1
}

# `known_hosts` needs somewhere to live, and ssh refuses a group-readable
# directory with `Permissions 0755 ... are too open` -- which reads as a broken
# key rather than as a fresh directory's mode.
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

if ! agent_can_sign; then
    echo
    echo "======================================================================"
    echo " No SSH identity is available in this container, by design."
    echo " Your Mac's agent is forwarded here, but it holds no keys."
    echo
    echo " Everything below runs ON THE MAC, in a Mac terminal."
    echo
    echo " 1. Find the key GitHub knows. Either of these tells you:"
    echo "       grep -A2 github.com ~/.ssh/config"
    echo "       ls -l ~/.ssh/id_* ~/.ssh/*_rsa ~/.ssh/*_ed25519 2>/dev/null"
    echo
    echo " 2. Load it into the agent. Without a path it adds the standard"
    echo "    default names; with one, it adds exactly that key:"
    echo "       ssh-add --apple-use-keychain"
    echo "       ssh-add --apple-use-keychain ~/.ssh/<the-one-from-step-1>"
    echo
    echo " 3. Check it took:"
    echo "       ssh-add -l          # should list the key, not 'no identities'"
    echo
    echo " 4. Reopen this container. Then in here, the same ssh-add -l"
    echo "    should list it too -- that is the forwarded socket working."
    echo
    echo " Why your ~/.ssh/config may already look right and still leave this"
    echo " empty: AddKeysToAgent fires when the *Mac* opens a connection, and a"
    echo " push from in here uses the forwarded socket, so it never triggers."
    echo " UseKeychain is what reloads the key after a reboot. Neither loads it"
    echo " the first time -- step 2 does, or any ssh from a Mac terminal."
    echo
    echo " Nothing signable is kept in this container."
    echo "======================================================================"
    echo
fi

# --- 6. Claude Code's own package directory ----------------------------------
#
# **The `claude-code` feature installs as root, so the CLI cannot update
# itself**, and the banner it prints blames the prefix rather than this scope.
# Scoped deliberately: a blanket `chown -R` over the prefix would hand this
# user packages meant to stay root's.
NPM_PREFIX="$(npm prefix -g 2>/dev/null)"
NPM_SCOPE="$NPM_PREFIX/lib/node_modules/@anthropic-ai"
if [ -d "$NPM_SCOPE" ] && [ ! -w "$NPM_SCOPE" ]; then
    # `-R` here, unlike section 2: the contents are root-owned too, and an
    # update rewrites files inside the package.
    sudo chown -R "$(id -u):$(id -g)" "$NPM_SCOPE"
fi

# The package directory is not enough, and the banner outlives that chown.
# Three more directories, each blocking a different step, and the first is the
# one that keeps the warning up after the other two are fixed:
#
#   the prefix root  -- what the CLI's own writability check tests, so this is
#                       what decides whether the banner prints at all
#   lib/node_modules -- npm stages a temporary directory here beside the package
#   bin              -- npm relinks the executable here
#
# `lib` itself is deliberately absent: nothing writes to it, and its uid 1001 is
# the tell for where all of this comes from. The Dockerfile extracts the Node
# tarball into the prefix as root, and `tar` keeps the archive's ownership, so
# these carry Node's build user -- an account that exists on no machine that
# runs the image. The directories only, never `-R`: their contents are every
# other global package and Node's own binaries, which stay as they are.
for d in "$NPM_PREFIX" "$NPM_PREFIX/lib/node_modules" "$NPM_PREFIX/bin"; do
    [ -d "$d" ] && [ ! -w "$d" ] && sudo chown "$(id -u):$(id -g)" "$d"
done

# --- 7. The self-update this user is now able to run ------------------------
#
# **Section 6 makes the update possible; this makes it correct.** npm 12 blocks
# a dependency's install scripts unless `allow-scripts` names it, and the CLI
# updates itself by running `npm install -g @anthropic-ai/claude-code` as *this*
# user. The Dockerfile's allowance is in `/root/.npmrc` and covers the feature's
# build-time install only, so an update run from here installs the package clean
# and leaves `bin/claude.exe` as the 500-byte stub -- which presents as Claude
# Code working for a minute and then exiting with *native binary not installed*.
#
# npm reads this setting from the user and project files only, so it is
# `$HOME/.npmrc` or nothing: `--location=global` writes a file npm does not
# consult, and an environment variable reaches the workspace's own `npm ci`,
# which npm refuses outright with `EALLOWSCRIPTS`. One package name, so the
# repo's posture is unchanged.
if [ -f "$HOME/.npmrc" ]; then
    grep -q '^allow-scripts=' "$HOME/.npmrc" \
        || printf 'allow-scripts=@anthropic-ai/claude-code\n' >> "$HOME/.npmrc"
else
    printf 'allow-scripts=@anthropic-ai/claude-code\n' > "$HOME/.npmrc"
fi

# And repair an update that already landed under the block. The postinstall is
# idempotent and is the documented way to finish a blocked install, so this is
# the package's own remedy rather than a workaround. Repaired rather than
# reported, as section 3: the alternative is a container whose `claude` is a
# stub until somebody reads a warning they are not there to read.
CC_PKG="$NPM_PREFIX/lib/node_modules/@anthropic-ai/claude-code"
if [ -f "$CC_PKG/bin/claude.exe" ] && [ -f "$CC_PKG/install.cjs" ] \
   && [ "$(stat -c %s "$CC_PKG/bin/claude.exe")" -lt 10000 ]; then
    echo "==> claude's native binary is the stub; running the package's postinstall"
    (cd "$CC_PKG" && node install.cjs) \
        || echo "==> WARNING: claude's postinstall failed; \`claude\` will not start" >&2
fi

exit 0
