# `ui/` — the React front end

The front end. There is one, and this is it — the server-rendered tier it was built beside is deleted.

Assume no npm knowledge below. Two commands is all of it.

---

## Run it

**Node 26 or newer**, which is what `package.json`'s `engines` declares in both this package and `server/`, and what `docker/app/Dockerfile` builds on. `nvm install 26 && nvm use 26` if `node --version` is under the floor.

The first run needs the dependencies installed once:

```bash
cd ui && npm ci
```

Install under the Node you will *run* under. A tree installed on 20 and run on 24 leaves rolldown's native binding unresolved — `Cannot find native binding` out of vitest — and the fix is `rm -rf node_modules && npm ci` on the new one.

```bash
cd /path/to/IncidentCompanion
./dev-node.sh
```

That one command starts Postgres and Redis in containers, pushes the schema, starts Nest with `--watch`, creates the dev analyst, and then starts Vite in front of it. It prints a URL near the end:

```
  ➜  Local:   https://localhost:5173/
```

Open that. Sign in as **`analyst@example.test` / `incidentcompanion-dev`**.

**https, on both halves, and it is not optional.** Better Auth names the session cookie `__Secure-…` over https and a `__Secure-` cookie never crosses a plaintext hop — so a http dev server in front of a TLS API signs in and then 401s on everything after it. Vite serves the same generated pair the server does.

**The database is a tmpfs and is recreated on every start**, so the schema on screen is always the schema in the migrations. `--keep-data` opts out when you want test data to survive a restart.

**Ports are derived per worktree**, not written down: `server/scripts/stack.mjs` allocates a slot and every port comes from it, so two worktrees can each hold a stack without colliding. `node server/scripts/stack.mjs --json` prints this tree's.

**The prefix is `/` and it is written in two places** — Vite's `base` in dev and in the build, and the router's basename off `import.meta.env.BASE_URL`. They must agree; changing one is how the app serves a blank page with a 200.

`.claude/scripts/worktree_setup.sh` installs both packages in a fresh worktree. The explicit `npm ci` above is for anything that skips it — `npm run build`, `npm run test`, Storybook.

A small **ground switcher** floats in the corner of the running app itself (bottom right) — light, dark or system. One design language ships, so nothing chooses one.

## The second way to run it: no Vite at all

`./dev-node.sh` is the loop you *develop* in — Vite compiles on save and proxies `/api` to Nest. It is not what the app is when it runs.

```bash
cd /path/to/IncidentCompanion
docker compose up --build
```

The bundle is then served at **`https://localhost/`** — by nginx, which terminates TLS and proxies to the app over the compose network. Nothing is loaded from a CDN. The bundle is built inside the image by `docker/app/Dockerfile`'s `ui-build` stage, so this needs no `npm run build` on the host.

**`--build` is not optional.** `docker compose up` alone reuses whatever image exists, so an edited front end is served from the previous build with nothing saying so — and `logging: driver: "none"` on the app means there is no log to notice it in.

Use this whenever the question is how the React UI *performs* or *behaves* rather than how it looks while you edit it: a dev server compiles on demand, serves unminified modules and holds a websocket open, so anything measured against it is measuring Vite.

- **Mounted by default**, and the flag turns it *off*: `--no-serve-ui`, or `INCIDENTCOMPANION_NO_SERVE_UI=1`, leaves the API running alone. That is the shape an agent wants; a person almost never passes it.
- **You sign in once.** The SPA's own form is the only one, and its cookie is what authorises `/api` — see *How the analyst is authenticated*.
- A missing `ui/dist` prints one line saying which command fills it, and the API starts normally.

## Look at it without running anything

```bash
cd ui && npm run build-storybook
open storybook-static/index.html
```

That is a set of static files. No server, no Python, no network. Every story renders from `src/fixtures/campaign.json` — a real `GET /api/cases/DEMO-CAMPAIGN` captured off a running app, 86 timeline entries and all.

**Storybook renders the production components.** `TimelineList.stories.tsx` imports the same `TimelineList.tsx` the app imports. There is no demo variant of anything, and there must not be: every design approved in this project's history was an artifact sharing no code with what shipped, which is why the approval never transferred.

The toolbar has a **Theme** switch (light/dark) and a **Language** one that currently offers a single entry, `console` — the comparison languages the design phase ran against are gone, and `tokens.css` declares one `[data-language]` block. The token layer is still built so a second is a block of CSS variables and no component change at all.

## The other commands

| command | what it does |
| --- | --- |
| `npm run lint` | ESLint, `@typescript-eslint` strict + type-checked |
| `npm run test` | Vitest |
| `npm run build` | typecheck and production bundle into `ui/dist` |
| `npm run storybook` | Storybook with live reload, port 6006 |
| `npx tsx ../server/scripts/dump-specs.ts src/fixtures/specs.json` | refreshes the specs fixture |

**The specs fixture needs no running app any more.** `./dev.sh --capture-fixture` captured it from the live Python API; `dump-specs.ts` serialises the domain schemas directly, so it needs neither a server nor a seeded case — and it is generated from the backend the client actually talks to, which the captured one was not.

**A plain `./dev-node.sh` writes nothing that git tracks.** The types used to regenerate on every start, so opening the dev loop left a dirty tree and the next commit swept up churn nobody had made.

Two agents at once: every port is derived per worktree by `server/scripts/stack.mjs`, so nothing needs an override; `STORYBOOK_PORT` still takes one.

---

## How the analyst is authenticated

**The app's own `HttpOnly` session cookie, and nothing else.** A reload keeps you signed in. The client holds no token at all.

The parked option in this section's previous version is the one that landed: the server now sets the cookie on `POST /api/login` and `api_routes._authorised` accepts it at every rung *whatever the install-wide API level says* — the level is the ceiling on external clients, and the app's own UI is not one. So `credentials: 'include'` on every fetch is the whole of the client's half.

That closes the exposure the in-memory bearer was working around. The threat was never the network — the app is loopback-only over TLS — it was a script running inside the page, and there is no plugin sandbox in this product: an enabled plugin is in-process Python with the app's full access, rendering into this same origin. An `HttpOnly` cookie is unreadable to every one of them, which `localStorage`, `sessionStorage` and a module closure that a script shares the heap with are all not.

Two consequences worth knowing before changing anything here:

- **No `Authorization` header is ever sent.** `_authorised` consults the cookie precisely when no such header arrived, so attaching a bearer as well would route the request down the *external client* path — which the API level does bound, and which is off by default. `src/api/client.test.ts` pins its absence.
- **A cookie-authenticated write must carry this app's own `Origin`** (ASVS V13.2.3), which is why `vite.config.ts`'s proxy rewrites it. `changeOrigin` rewrites `Host` only; without the `configure` hook every write 403s under `vite dev` and reads as a permissions bug. Measured both ways.

What is still stored client-side is a **display identity** — the username and the rung, in `localStorage`. It authorises nothing; it exists so a reload can render the shell without a round trip, and a stale copy is corrected by the first 401. `src/api/client.test.ts` asserts no credential appears in any store.

**Sign-out calls `POST /api/logout`**, which revokes the session id server-side (ASVS V3.3.1). Clearing local state is not the control — the cookie is a signed claim, so a copy taken a moment earlier stays valid until the server refuses it.

The session expires after a window of no *real input* — 30 minutes by default, `app/idle.py`. `useActivityReporter` posts to `/activity` on keys and pointers, throttled to once a minute. It deliberately has no heartbeat: a timer reporting on its own would turn the timeout into a no-op for exactly the abandoned tab it was written to catch.

---

## For whoever builds the next screen

**The `ui-design` skill is the one to read first.** It carries the kit, the shared blocks a screen may not re-grow, and what every data surface owes.

What is worth knowing before the first edit:

- Import from `@/api/*`. `src/api/client.ts` is the **only** file that calls `fetch`. Everything else calls `request()`.
- Query keys come from `@/api/queryKeys`. Never write the array inline.
- Writes go through `useEntryCreate` / `useEntryMutation` / `useEntryDelete` / `useCaseMutation` — per row, only the changed fields.
- `useWritable()` says what this sign-in may do. Do not read `session.access`, and do not work it out from your own mutation's error.
- `useCaseId()` reads the case from the route. A section takes no `caseId` prop.
- Add a screen by adding a row to `features/workspace/sections.tsx` and a component. The router, the rail and the outlet all read that list. Its actions go in the command registry, never a hand-built row — `SectionActionRow` draws the toolbar, the palette and the cheat sheet from the one list, so an action cannot be in one and missing from another.
- `AsyncBoundary` owns loading, error and the 409-that-is-a-wait. `EmptyState` owns an empty table. `reportWriteFailure` owns a refused write that no section is rendering.
- Fields are `<Field>` + `Input`/`Select`/`Textarea` — it wires `for`/`id` and `aria-describedby`, which is what a hand-rolled field forgets.
- Every visual value comes from `src/styles/tokens.css`. A hex, a `duration-150` or an `h-8` in a component is a defect and `tokens.test.ts` fails on it.
- A screen splits in two: a container that queries, and a component that takes data and callbacks. The second one is what gets a story.
