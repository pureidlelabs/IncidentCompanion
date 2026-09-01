# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only
#
# The Node server, containerised. See `compose.yaml` for how it is run.
#
# **Built from the repository root**, because the front end is in `ui/` and the
# wire types it typechecks against are in `server/src/domain`.
#
# Four stages: the build needs devDependencies and TypeScript source, the
# runtime needs neither.

# 26 is the floor `ui/.nvmrc` and both `package.json` files declare, and
# `tests/docker/test_stack_images.py` holds this line equal to them.
FROM node:26-slim@sha256:c0753125a3789977aefe869cbebccf70e3cfd7ea84ca48547458f02e4f1d7146 AS ui-build
WORKDIR /repo

# **The workspace root, and both manifests, before any source.** One lockfile
# decides for both packages, and the client build reads `@contract/*` into
# `server/src/domain` - so the packages *those* files import have to resolve by
# bare name too. A root install is what makes that true; this stage used to
# symlink `/ui/node_modules` at `/server/node_modules` to fake it.
#
# **`.npmrc` too, or this stage cannot install** -- it carries the
# `legacy-peer-deps=true` an eslint peer conflict needs, and the failure is
# ERESOLVE rather than a missing file. `--include=dev` because `vite` and
# `typescript` are devDependencies.
COPY package.json package-lock.json .npmrc ./
COPY ui/package.json ui/
COPY server/package.json server/
# **The shared schema package whole, before the install** -- its `prepare`
# builds `dist` during `npm ci`, so its source has to be present, and both
# tiers import it by bare name. It is small and rarely changes, so copying it
# here costs the manifest-only cache layer little. -> `@incidentcompanion/prose-schema`
COPY packages/prose-schema/ packages/prose-schema/
RUN npm ci --include=dev

COPY ui/ ui/

# What lives outside `ui/` and the client build reads anyway. Each fails as a
# resolution error rather than as a missing file.
#
# `tools/eslint-rules/` is reached by the `*.rule.test.ts` files, which `tsc -b`
# compiles along with everything else -- so the build needs the rules a lint
# tier owns.
COPY server/src/domain/ server/src/domain/
COPY tools/eslint-rules/ tools/eslint-rules/

RUN npm run --workspace ui build


# Also run as the `migrate` service: `drizzle-kit` is a devDependency reading
# TypeScript from `src/db/schema/`, so the push needs this tree.
FROM node:26-slim@sha256:c0753125a3789977aefe869cbebccf70e3cfd7ea84ca48547458f02e4f1d7146 AS server-build
WORKDIR /repo

# `--include=dev` although nothing sets `NODE_ENV=production` in this stage
# today -- the flag keeps that true when a base image or build arg does, and
# without it npm omits `typescript` and the build dies on a missing `tsc`.
COPY package.json package-lock.json .npmrc ./
COPY ui/package.json ui/
COPY server/package.json server/
COPY packages/prose-schema/ packages/prose-schema/
RUN npm ci --include=dev --no-audit --no-fund --workspace server
# **Explicit, not left to `prepare`** -- `--workspace server` does not
# reliably run a linked workspace dependency's build, and the server build
# imports its `dist`. -> `@incidentcompanion/prose-schema`
RUN npm run --workspace @incidentcompanion/prose-schema build

COPY server/ server/
RUN npm run --workspace server build


# The production tree, built once and copied, so the final image never carries
# a toolchain it would have to remove.
FROM node:26-slim@sha256:c0753125a3789977aefe869cbebccf70e3cfd7ea84ca48547458f02e4f1d7146 AS runtime-deps
WORKDIR /repo
COPY package.json package-lock.json .npmrc ./
COPY ui/package.json ui/
COPY server/package.json server/
COPY packages/prose-schema/package.json packages/prose-schema/
# **`--workspace server`, so the client's own runtime dependencies stay out of
# the final image** -- a root install would put React in it.
#
# **`--omit=optional` is deliberately absent, and adding it breaks the server
# at boot** by removing argon2's native binding.
#
# **`--ignore-scripts`, because the shared package's `prepare` runs `tsc`** and
# TypeScript is a devDependency this stage omits. Its `dist` is copied from the
# build stage into the final image instead of rebuilt here.
RUN npm ci --omit=dev --omit=peer --no-audit --no-fund --workspace server --ignore-scripts \
 && npm cache clean --force

# **`drizzle-kit` survives every npm flag that is safe to pass**, so the four
# are deleted by name; the other three are reachable through nothing else.
RUN rm -rf node_modules/drizzle-kit node_modules/@electric-sql \
           node_modules/@rolldown node_modules/@esbuild


FROM node:26-slim@sha256:c0753125a3789977aefe869cbebccf70e3cfd7ea84ca48547458f02e4f1d7146 AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=runtime-deps /repo/node_modules ./node_modules

# The shared schema package the `node_modules` symlink points at, built in the
# server-build stage. Its relative link (`../../packages/prose-schema`) resolves
# to `/app/packages/prose-schema` once `node_modules` lands under `/app`.
COPY --from=server-build /repo/packages/prose-schema/package.json ./packages/prose-schema/package.json
COPY --from=server-build /repo/packages/prose-schema/dist ./packages/prose-schema/dist

COPY --from=server-build /repo/server/dist ./dist

# swc preserves the source folder, so `main.ts` is at `dist/src/main.js` and
# resolves the vendored viewer two hops up. Under tsc's `rootDir` it would be
# one, and this path would be wrong.
COPY --from=server-build /repo/server/vendor ./vendor

# `bundlePath` walks four levels up looking for `ui/dist`, which is a
# checkout's layout and not an image's. `UI_DIR` is what it exists for.
COPY --from=ui-build /repo/ui/dist ./ui
ENV UI_DIR=/app/ui

# Both are volumes in `compose.yaml`; created here so the image still starts
# without them, and the mode they are created at decides whether a managed
# volume works at all.
RUN mkdir -p /evidence /install && chown node:node /evidence /install
ENV EVIDENCE_DIR=/evidence

# **`COPY` then `RUN chmod`, never `COPY --chmod`**, which needs BuildKit and
# fails at the last step on a classic builder.
COPY docker/app/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh

USER node

# **0.0.0.0, and narrowing it breaks the container rather than hardening it**:
# a published port cannot reach the container's own loopback. Confinement is
# `compose.yaml` publishing nothing for this service -- the port is reachable
# from nginx on the compose network and nowhere else, which is the whole reason
# it may speak plaintext. There is deliberately no `Host` allowlist behind it.
EXPOSE 8080

ENTRYPOINT ["docker-entrypoint.sh"]

# Exec form, and no `npm`: a shell and an npm between tini and node forward no
# SIGTERM, and Nest's shutdown hooks are what close the database pool.
CMD ["node", "dist/src/main.js"]
