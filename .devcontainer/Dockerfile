# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only
#
# The *development* container, almost entirely toolchain. `docker/app/Dockerfile`
# builds the shipping app image and deliberately carries none of it.
#
# **Several things here look like a devcontainer feature somebody forgot to
# use, starting with the base.** Each is a rejected alternative.
FROM python:3.14-slim@sha256:cae66f2ef0ec51a9891263eeee7f987dacf0a9879e8aa9353d5606e0530619a5

# `common-utils` (in devcontainer.json) creates the non-root user and needs
# these present first -- without `sudo` the feature succeeds and every later
# one expecting a sudoer fails. `procps` is load-bearing too: `dev-node.sh`
# needs `pgrep` to reap Nest's children, and a slim image has none.
# `libatomic1` is what the official Node binary links against, and the Python
# image carries neither it nor a reason to.
#
# `ripgrep` and `jq` were here and are in `mise.toml` now, with every other
# tool that has a version worth knowing.
RUN apt-get update && apt-get install -y --no-install-recommends \
        sudo \
        git \
        curl \
        ca-certificates \
        procps \
        less \
        openssh-client \
        libatomic1 \
    && rm -rf /var/lib/apt/lists/*

# Build tooling for `requirements-dev.txt` alone: a dev-only dependency with no
# 3.14 wheel otherwise fails the bootstrap at step 3 of 4 with a compiler error.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# **Every version this container pins is written in `mise.toml`, and nothing
# else.** Each tool below arrived as a `curl`, a checksum per architecture and a
# comment asking the next person to fetch two hashes -- which is why Node sat at
# 26.7.0 while `docker/app/Dockerfile` silently shipped whatever `26-slim` meant
# that afternoon.
#
# mise verifies what it downloads, and by more than the hashes it replaces: for
# a tool published with them it checks GitHub artifact attestations, which are a
# signed statement of the workflow that built the artefact rather than a digest
# somebody pasted here.
#
# **mise itself arrives as an image reference**, which the `dockerfile` manager
# already reads and `docker:pinDigests` already pins. So the thing that tracks
# every other version is tracked too, and the regress ends rather than moving up
# a level.
#
# Still not the `node` devcontainer feature, for the reason that always applied:
# its installer pipes `raw.githubusercontent.com` into `bash` with no `-f`, so
# that host's 429 executes as a build step.
COPY --from=jdxcode/mise:2026.8.15@sha256:0f78b61792734627f3188613063c233bd04390723dc41a4cfa0f35dcce162cf9 /usr/local/bin/mise /usr/local/bin/mise

# `--system` installs outside the home directory, which devcontainer.json mounts
# over. The shims are on PATH for every user the image ends up with.
#
# `MISE_TRUSTED_CONFIG_PATHS`: mise refuses an untrusted config, and a build has
# no interactive moment to grant it.
ENV MISE_DATA_DIR=/usr/local/share/mise \
    MISE_GLOBAL_CONFIG_FILE=/etc/mise/config.toml \
    MISE_TRUSTED_CONFIG_PATHS=/workspace \
    PATH=/usr/local/share/mise/shims:$PATH

COPY mise.toml /etc/mise/config.toml
RUN mise install --system && mise reshim

# **The shims above do not read `[env]`**, so the workspace's `mise.toml` needs
# activation as well. Interactive shells only; everything scripted keeps the
# shims. `/etc/zsh` is made first: zsh arrives with the `common-utils` feature,
# after this image builds.
RUN printf '\neval "$(mise activate bash)"\n' >> /etc/bash.bashrc \
    && mkdir -p /etc/zsh \
    && printf '\neval "$(mise activate zsh)"\n' >> /etc/zsh/zshrc

# **`docker compose` is a CLI plugin, not a command.** mise installs the binary,
# and 21 call sites in this tree spell the subcommand form; this is what makes
# them resolve.
RUN mkdir -p /usr/local/lib/docker/cli-plugins \
    && ln -s "$(mise which docker-compose)" \
             /usr/local/lib/docker/cli-plugins/docker-compose


# npm 12, over the 11 the Node tarball bundles. It disables dependency install
# scripts by default and blocks git and remote-URL dependencies -- which is the
# security posture this repo already runs under: `allowScripts` in the root
# manifest and no git or remote dependency, so a fresh `npm ci` resolves
# unchanged (verified against the lockfile, 1233 packages, no blocked script).
# Pinned like Node; bump the two together when the major moves.
# renovate: datasource=npm depName=npm
ARG NPM_VERSION=12.0.2
RUN npm install -g "npm@${NPM_VERSION}" && npm --version

# **The block reaches the `claude-code` feature too, and that install has no
# manifest to declare itself in.** The feature runs `npm install -g
# @anthropic-ai/claude-code`, whose postinstall is what copies the native binary
# over the 500-byte stub in `bin/claude.exe`; blocked, the package installs
# clean and `claude` exits with *native binary not installed*. Verified in a
# rebuilt container: the linux-arm64 optional dependency was present and the
# stub was untouched.
#
# **Root's user npmrc, and neither of the two spellings that read better.**
# `--location=global` writes `/usr/local/etc/npmrc`, which npm does not consult
# for this setting -- the install is blocked exactly as before, and npm's own
# warning names `--location=user`. An `ENV npm_config_allow_scripts` does reach
# it, and then reaches every other npm call too: npm refuses the setting outright
# in a project-scoped install (`EALLOWSCRIPTS`), so `npm ci` in the workspace
# fails and `postCreateCommand` dies with it. The feature installs as root, so
# root's file covers it and no other user sees it. One package name, so the repo
# posture above is unchanged.
RUN printf 'allow-scripts=@anthropic-ai/claude-code\n' > /root/.npmrc

# Playwright's Chromium and its system libraries, so the browser tier
# (`server/e2e/`, `npm run visual`) runs without a per-session `npx playwright
# install`. **Version-locked to `@playwright/test` rather than sha-checksummed**,
# unlike Node and Vale above: Playwright ties each browser build to the runner
# version and verifies it itself, so an sha here would be a second integrity
# check that drifts -- the pin instead moves with `server/package.json`'s
# `@playwright/test` (1.62.1 today). `--with-deps` installs the apt libraries
# and the browser together, and `PLAYWRIGHT_BROWSERS_PATH` puts it in a system
# path every user and worktree resolves rather than a per-user `~/.cache`.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
# renovate: datasource=npm depName=@playwright/test
ARG PLAYWRIGHT_VERSION=1.62.1
RUN npx -y "@playwright/test@${PLAYWRIGHT_VERSION}" install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# **`PIP_REQUIRE_VIRTUALENV` is deliberately absent**, and adding it breaks the
# bootstrap's first `pip install`.
ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Baked into the image rather than read from the workspace: `onCreateCommand`
# clones the workspace volume, so nothing under it exists until this script
# has already run.
COPY clone-workspace.sh /usr/local/bin/ic-clone-workspace.sh
RUN chmod +x /usr/local/bin/ic-clone-workspace.sh

# **A build that succeeds proves the image assembled, not that it works.** Baked
# in rather than run from the workspace, for the same reason as the script above
# and because the gate runs it against a freshly built image with no workspace
# at all.
COPY smoke.sh /usr/local/bin/ic-smoke.sh
RUN chmod +x /usr/local/bin/ic-smoke.sh
