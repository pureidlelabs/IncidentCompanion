<!--
Copyright (C) 2026 Boudewijn SPDX-License-Identifier: AGPL-3.0-only -->

# The dev container

Runs the toolchain inside a container, so what an agent executes lands there rather than on the laptop.

## Set it up

You need [OrbStack](https://orbstack.dev). There is no per-project provisioning step.

1. Install OrbStack and start it.

   ```bash
   brew install --cask orbstack
   ```

2. Raise the memory ceiling. The default is 8 GB, and the suite, a Vite server, Postgres and Redis together want more.

   ```bash
   orb config set memory_mib 12288
   ```

   It is a ceiling rather than an allocation, so memory comes back when it is not in use.

3. In VS Code, open this repository as you normally would, then run **Dev Containers: Reopen in Container**. The folder you opened is only where VS Code finds `devcontainer.json` — the container clones its own copy of `main` from GitHub over SSH into a volume on first start, and that clone, not the folder you opened, is what you edit from here on.

4. Open a terminal in the container and run `claude`.

You sign in once and it survives rebuilds.

If OrbStack asks for admin access you can decline. Everything here works without it.

## Let git clone and push sign

No SSH key exists in this container and none is copied in. Signing happens on the Mac through the forwarded agent, so your private key never leaves it — and the same agent is what the first-start clone authenticates with, so an empty agent fails the clone before you ever see a prompt.

1. On the Mac, add your key to the agent. With no path it adds the standard defaults.

   ```bash
   ssh-add --apple-use-keychain
   ```

2. Reopen the container, or push from it.

`ic-clone-workspace.sh` seeds `known_hosts` for `github.com` itself with `ssh-keyscan`, since the first-start clone runs non-interactively and cannot answer a host-key prompt. It and `post-start.sh` both print a reminder when they find an empty agent.

**`AddKeysToAgent yes` in `~/.ssh/config` does not cover this.** It fires when the *Mac* opens a connection, and a push from the container uses the forwarded socket instead — so a config that looks complete can leave the agent empty. `UseKeychain yes` is what restores the key after a reboot.

Do not set `StrictHostKeyChecking=no`. `~/.ssh` is an ordinary directory in the container layer, so the acceptance does not survive a rebuild, which is the cost of not having a key here.

## Change your global Claude config

`rules/`, `plugins/`, `agents/`, `commands/`, `skills/`, `output-styles/` and `settings.json` are copied from the Mac into the container's own volume on first start. After that the container runs on its copy: editing a rule here does not touch the Mac, and a restart does not revert it.

To pick up a change you made on the Mac:

1. Delete the marker in the container.

   ```bash
   rm ~/.claude/.seeded-from-host
   ```

2. Move aside anything you want replaced. Existing files are never overwritten.

3. Restart the container.

`history.jsonl`, `todos/`, `security/` and `.credentials.json` are not readable from the container at all, and neither is any session under `projects/`.

**The project's memory is the exception, and it is shared live rather than seeded** — one directory, bound read-write, so a memory written in here is on the Mac at once and the other way round. It is bound at the key a session *here* computes (`-workspace`), which is not the key the Mac uses.

## What the container does and does not contain

**It contains accidents, not an adversary.** A stray `rm -rf`, an `npm install` that writes outside the repository, a global tool install — those land in the container. A malicious project does not.

Two things are not contained, and both are worth knowing before you hand an agent a wide instruction:

- **The filesystem.** The container holds the docker socket, so it can start a sibling container that mounts anything OrbStack shares, which is the whole Mac.
- **The network.** An agent here can reach the public internet, this Mac over the LAN, and every device on your home network.

What the container's own mounts hand over is still narrow: the app's data root, its own workspace and Claude volumes, this project's memory directory, and read-only copies of the seven config paths above. `~/.ssh` is not a mount at all — an ordinary directory in the container's writable layer, gone on a rebuild. Your keys, your Claude sessions and your Mac checkout are not among them — the workspace is a clone the container made itself, not a mount of anything on the Mac.



## Reach a service another container publishes

Containers you start here are siblings, not children — there is one daemon and no nesting. A sibling publishing on `127.0.0.1` binds the VM's loopback, which is not the container's.

`runArgs: ["--network=host"]` is what makes `dev-node.sh`, `stack.mjs` and the probes work unchanged, because they all use `127.0.0.1`.

For anything self-contained — a model cache, a database's data — use a named volume and no mount. A bind to macOS is the slow path.

## What to expect

- **First start is slow.** `ic-clone-workspace.sh` clones the repository, then `post-create.sh` builds a Linux `.venv` and runs three `npm ci`. The browser tier is not installed; the command is printed.
- **The suite is slower than on the Mac**, because it gets however many cores OrbStack is allowed. `orb config set cpu <percent>` is the dial.
- **The whole checkout, including any worktree made in here, lives and dies with the workspace volume** — there is no Mac-side copy to fall back to. Commit and push before removing it.
- **Sync with the Mac by `git push`/`fetch`, not by looking at files.** The folder you opened in VS Code and the container's clone are two independent checkouts of the same repository from the moment the container starts.

## Copying this to another project

Everything here is reusable as-is except four things:

1. **`clone-workspace.sh`**'s four variables at the top — `REPO_URL`, `BRANCH`, `GIT_NAME`, `GIT_EMAIL`. Nothing else in that script names this project.
2. **`devcontainer.json`**'s `"name"` — cosmetic, shown in VS Code's UI.
3. **`devcontainer.json`**'s bind of `${localEnv:HOME}/incidentcompanion` — this app's own data root. A project with no equivalent drops the line; one with an equivalent renames both sides. Its memory bind, and the `mkdir -p` for it in **`host-init.sh`**, are machine-specific as well as project-specific: the source spells the Mac's own checkout path.
4. **`Dockerfile`**'s tool list is this project's own toolchain (Python 3.14, Node 26, Vale, `ripgrep`, the docker CLI), not a generic base — pare it to what the new project's `test.sh`/`dev-node.sh` equivalent actually needs. The Node block itself is reusable as written: it is there rather than in `features` because the `node` feature pipes an unverified `raw.githubusercontent.com` response into `bash`, which fails whenever that host rate-limits you.

The mechanism itself — clone into a volume via a baked-in `onCreateCommand`, seed `known_hosts`, set a local git identity and `receive.denyCurrentBranch` — carries no project-specific assumption and needs no edit.
