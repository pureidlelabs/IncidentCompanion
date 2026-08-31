# Codebase Structure

The map: where a module lives and what it holds. Why something is done a particular way is in `openspec/` — the requirement in a capability's `spec.md`, the reasoning in its `design.md`.

## Runtime overview

**Five containers, one product.** `compose.yaml` brings them up in order.

- **nginx** terminates TLS on 443 and is the stack's only door to the host. It mints the certificate into the `ic-tls` volume and prints the fingerprint on a mint.
- **The Nest server**, under `server/`: TypeScript on `@nestjs/platform-express`, speaking **plaintext on 8080 and publishing no port**. It answers the API, serves the built React bundle, holds the case socket, and is the only thing that writes.
- **Postgres** holds every case, account and session. Row-level security is on, and the request-serving role cannot bypass it.
- **Redis** holds presence, claims, the socket fan-out and a session cache. Postgres stays authoritative behind the sessions, so losing Redis costs a reconnect.
- **React**, under `ui/`: Vite, React Router, TanStack Query and Form, Tailwind, React Aria Components. Every screen is here; the server renders no markup at all.

Two one-shots run before the server and exit: `roles` creates the database roles, `migrate` pushes the schema. A third, `seed`, writes the built-in library and the demo cases.

```text
main.ts
  -> platform.ts       Express platform, security headers, static bundle
  -> app.module.ts     every feature module
       -> auth/        Better Auth, sessions, accounts, the setup token
       -> access/      the case guard every :caseId route carries
       -> collections/ the generic write path: version check, references, freeze
       -> db/          Drizzle schema, scoping, the change feed
       -> live/        the per-case socket, presence, claims, prose
```

**`app/` is not in this picture.** It is the retired Python corpus, kept for checking Node behaviour against what it replaced. `run.py` still runs it and nothing else does. → `CLAUDE.md`

## Repository map

```text
.
|-- compose.yaml               The product: five services plus three one-shots
|-- dev-node.sh                Dev loop: Postgres and Redis in containers,
|                              Nest and Vite on the host, tmpfs database
|-- verify.sh                  Every tier in one command, failing on any
|-- test.sh                    The Python suite over root `tests/`
|-- docker/
|   |-- app/                   The server image, and the entrypoint that mints
|   |                          AUTH_SECRET on first run
|   |-- db/                    roles.sql and the image that applies it
|   |-- nginx/                 The edge: TLS, rate limits, the only publish
|   `-- secrets.sh             Writes the stack's credentials to .env, once
|-- server/                    The Nest server. See below
|-- ui/                        The React front end. See below
|-- tests/                     The Python suite: docker, docs, repo hygiene,
|                              and the cross-tier contracts
|-- tools/                     Brand rendering, an .iccase decryptor, eslint rules
|-- scripts/                   Odds and ends
|-- openspec/                  What the application must do, and why it is met
|                              that way. The specifications are the product
|-- .github/                   The gate a pull request passes, and the queue's
|                              own run. See below
`-- .claude/                   Guidance, rules, skills, the stop hook
```

**CI runs on a pull request into `main` and again in the merge queue.** `.github/workflows/ci.yml` gives the pull request the cheap tiers — the typechecks, the lints, Vale and the repository checks — and holds the suites and the image for the merge group, which is the only run whose tree is the one that lands. `gate` is the required check and the only one; it passes a tier that skipped, because skipping is how a tier says the paths it covers did not move.

## `server/` — the Nest tier

`architecture.test.ts` declares which area may import which, and fails on a reversal. `domain` may import nothing.

| Area | What lives there |
| --- | --- |
| `domain/` | The schemas, and everything true of a collection that needs no database. `collections.ts` is the one record; `field-spec.ts` is the form metadata; `references.ts` finds a reference on any schema |
| `db/` | Drizzle schema, `withCase` scoping, `updateVersioned`, the change feed |
| `collections/` | The generic write path every entity shares: the version check, the case-boundary reference check, the sent-report freeze, and the merge review |
| `auth/` | Better Auth's configuration, the setup token, the password hold and policy, the last-administrator rule |
| `access/` | `CaseAccessGuard`, and the test that every `:caseId` route carries it |
| `live/` | The `ws` upgrade, presence, claims, and the report CRDT |
| `report/` | The document model, the painters (PDF, Word, markdown), the freeze, the language packs |
| `case-archive/`, `archive/` | `.iccase` export and import, and the zip format with its bounds |
| `library/` | Case templates, report layouts and snippets — drop-in content, and the built-ins |
| `specs/` | What `/api/specs` serves: the form descriptors the client draws from |
| `wire/`, `platform.ts` | Response headers, compression, the static bundle |
| `test/` | The harness that boots a real app on a real database |

**Three structural facts that cause defects if forgotten:**

- **The generic collection path is where the guards are**, and it is not the only write path. Anything writing outside `CollectionService` asks `freezeGuardFor` and the reference check itself.
- **A reference is declared on the schema**, and both registries are read: `fields` for one an analyst picks, `identityReferences` for one that is identity. Miss either and the case boundary is unchecked.
- **The socket inherits nothing.** No guard, pipe, middleware or interceptor runs on an upgrade, so every check is re-implemented by hand in `live.gateway.ts`.

## `ui/` — the React front end

| Directory | What lives there |
| --- | --- |
| `app/` | The shell, routing, error boundaries |
| `screens/` | One file per screen area: cases, timeline, graphs, report, picker, auth, compliance |
| `components/blocks/` | The compositions **we** own that more than one screen renders - the grid, the expanded row, the filter row, the row's actions and menu, the severity badge, the pane head, the selection slot, and the entity dialog with its field row. `blocks.test.ts` lives here and fails when a screen re-grows one |
| `components/ui/` | Our wrappers over a single primitive - `Input`, `Field`, `Toolbar`, the dialogs. One primitive in, one component out; an assembly of several belongs in `blocks/` |
| `api/` | TanStack Query hooks, the generated OpenAPI types, the socket client |
| `lib/`, `styles/` | Helpers and the Tailwind layer |
| `fixtures/`, `test/` | What the suite renders against |

## Tests

| Tier | Command | Covers |
| --- | --- | --- |
| Server | `cd server && npm run check` | Typecheck and the Nest suite against a real database. **Not lint, and not the build** -- `npm run lint` and `npm run build` are separate, and a lint error survives a green `check` |
| React | `cd ui && npm test` | Components and hooks under jsdom, which has no layout |
| Python | `./test.sh` | Docker and compose, the docs, repo hygiene, cross-tier contracts |
| Agent | `pytest .claude/tests` | The stop hook, the skills, the guidance's own guards |
| Browser | `cd server && npx playwright test --config=e2e/playwright.config.ts` | Position, and the screens no other tier can see |
| Prose | `npm run lint:prose` | Vale over `openspec/`, `README.md`, `.claude/`, `.devcontainer/`, `server/`, `ui/src` and `tests/` |

`verify.sh` runs all of them. `python3 .claude/scripts/test_scope.py` says which a given change owes.
