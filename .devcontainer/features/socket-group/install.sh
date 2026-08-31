#!/usr/bin/env bash
# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only
#
# Put the docker socket's group in `/etc/group` at **image build**, so nothing
# has to be granted at the right moment later.
#
# Three placements were tried before this and each lost a race the devcontainer
# CLI does not document or order, each needing a rebuild to disprove:
#
#   runArgs --group-add ${localEnv:...:0}   -> GroupAdd=[]   (default resolved empty)
#   "containerUser": "vscode"               -> User=[root]   (ignored)
#   onCreateCommand                         -> too late      (measured: the
#       editor's `docker exec` started at 927.180 and onCreate's first side
#       effect at 927.394)
#
# In the image there is no moment. Measured on the shape this container has --
# init as root, the server arriving by `docker exec -u vscode`:
#
#     image has the user in the group  ->  docker exec -u vscode: `1000 0`
#                                          a nested shell:        `1000 0`
#
# `installsAfter` common-utils because that feature creates the user; this
# cannot run in the Dockerfile, which is earlier still.
set -euo pipefail

GID="${GID:-0}"
USERNAME="${USERNAME:-vscode}"

if ! getent group "$GID" > /dev/null 2>&1; then
    groupadd -g "$GID" dockerhost
fi

usermod -aG "$GID" "$USERNAME"
echo "socket-group: $USERNAME added to gid $GID ($(getent group "$GID" | cut -d: -f1))"
