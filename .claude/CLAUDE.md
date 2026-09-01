# IncidentCompanion

A self-hosted application for building a root cause analysis and running the investigation side of an MXDR/SOC incident. NestJS, React, Postgres and Redis, fronted by nginx and brought up by Docker Compose.

## The specifications are the product

`openspec/` says what the application must do. The code answers to it, so where the two disagree the code is what is wrong.

| | |
| --- | --- |
| `openspec/constitution.md` | The articles every specification answers to, the standards grounding and the deviation register |
| `openspec/specs/<capability>/spec.md` | One capability: its requirements, each with the scenarios that would show it false |
| `openspec/specs/<capability>/design.md` | Why a requirement is met this way, where the choice was live |
| `openspec/matrix/asvs.md` | Which OWASP ASVS controls the requirements answer, and which nothing answers |
| `openspec/changes/` | Work in flight, as deltas against the specifications |

**`changes/` is the in-flight form and `specs/` is the landed truth.** A branch's spec work is a delta under `openspec/changes/<id>/`; the sync folds it into `specs/` and archives it before the merge, so `specs/` always answers *what the application does today*. Editing `specs/` directly is for wording that leaves every requirement saying the same thing. → `rules/git-workflow.md` §7a

Read the constitution before proposing anything that touches security, the write path, or what an operator is expected to do. A requirement is met when its scenarios are demonstrated, and not before — coverage is scenarios, never lines.

**The specifications carry no inventory.** What a case holds — the collections, the fields, the vocabularies, the report's parts — is derived from the schemas that validate every write. Ask the application; writing it down makes a second description that drifts from the one doing the work.

## Commands

```bash
./dev-node.sh                            # Postgres, Redis, schema, Nest, Vite
.claude/scripts/worktree_setup.sh        # a fresh worktree, before anything else
python3 .claude/scripts/test_scope.py    # what this change actually needs run
./verify.sh                              # every tier; names a skipped tier
```

**A worktree has no `.venv`, and `python3` is not the interpreter the suites need** — `python3 -m pytest` answers `No module named pytest`. `bash scripts/venv_python.sh` prints the one to use, borrowing the main checkout's. An interactive shell has it already: `mise.toml` activates that same venv, deriving the path the same way rather than making the worktree one that would shadow it.

**`pytest tests/` unqualified builds containers** and runs past two minutes. `pytest tests/docs tests/repo tests/contract .claude/tests` is the everyday selection; `tests/docker` is the tier that costs.

**The OpenSpec CLI is installed nowhere, and its own skills name it wrong.** They declare `Bash(openspec:*)`; `openspec` is not on `PATH` and `npx openspec` resolves to an unrelated package that fails with *could not determine executable to run*. The package is `@fission-ai/openspec`:

```bash
npx --yes @fission-ai/openspec@latest validate --strict
```

`cd server && npm run check` with no environment set: the vitest and Playwright configs exec `stack.mjs` and fill the environment themselves. The exception is a tool that takes its own URL, and **mise holds the environment for those** — the root `mise.toml` sources `stack-env.sh`, so a shell standing anywhere in the tree already has `DATABASE_URL` and the rest, and each worktree gets its own stack because the path resolves against the `mise.toml` beside it.

**mise refuses a config it has not been told to trust**, so `mise trust` is the one-time step on the host, per checkout rather than per shell. The dev container is already told, by `MISE_TRUSTED_CONFIG_PATHS` in its Dockerfile.

**It reaches an interactive shell and nothing else, which is the half an agent does not get.** Activation is a prompt hook, so a `docker exec`, a script and every command a tool runs are still bare — mise's own answer is that `activate --shims` "does not support hooks, [env] variables, or watch_files". So `eval "$(node server/scripts/stack.mjs --export)"` remains the form to use in anything scripted, and on a host without mise. → <https://mise.jdx.dev/faq.html>

`DATABASE_URL` is the app role, which has no DDL, so `drizzle-kit` needs the migrate role on top of it:

```bash
DATABASE_URL="$IC_MIGRATE_DATABASE_URL" npm run db:push
```

`./test.sh` is the client and the repository checks only.

**CI runs on a pull request into `main` and again in the merge queue, and the two runs are not the same run.** The pull request gets the cheap tiers — both typechecks, both lints, Vale, the shell and workflow lints, the repository checks and both builds. **The suites and the image run only in the merge group**, against the tree merged onto the `main` it is about to enter, because that is the only tree whose verdict decides anything. So a green pull request means the branch is sound, not that it lands clean. **A push to a feature branch still fires none of it.** → `rules/git-workflow.md` §8.

## Testing

**Every fix and new behaviour owes a test, written before the fix**, and written from an attack rather than from an intention: ask how to make this do the wrong thing, not what it was meant to do.

**Break-verify what you write, and know what that proves.** Breaking the code on purpose and watching a check fail establishes that the check is connected to something, nothing more — the mutation is chosen by whoever wrote the assertion. **Prove the mutation applied**: one that silently fails to match leaves the test green and looks like a pass.

**Neither suite can see.** jsdom gives every element a zero box, so a layout rewrite passes its own tests while every number in it is `0px`. For the shell, navigation, tables, dialogs, the picker, the auth screens or the graphs, run the `visual-check` skill rather than writing a Playwright script.

## How to work here

IMPORTANT: Never speculate about code you have not opened, and never report the absence of a thing you searched for by one spelling. A claim about this codebase carries the command that produced it, in the same message. Search for the artefact rather than for the idiom you expect, and say where you looked.

**"That failure was already there" is a claim, so measure it.** A throwaway worktree at the base, with `node_modules` symlinked from yours, runs the same suite against the tree you did not write — cheaper than reasoning about which of your files could reach it, and it answers a question reasoning cannot close:

```bash
git worktree add --detach <scratch> origin/main
ln -s "$PWD/node_modules" <scratch>/node_modules && ln -s "$PWD/ui/node_modules" <scratch>/ui/node_modules
```

Deliver what was asked, at the scope intended. No refactoring of surrounding code, no flexibility nobody requested, no second way to do something the application already does — ask whether a thing should exist before asking whether it conforms. Remove any scratch file or script you made on the way.

Keep replies short and lead with the outcome. Say a thing once: no prose restating a table, no closing summary of what was just read. The same holds for anything written to disk.

Do not delegate work you can finish in a handful of tool calls, and never delegate verifying your own work. There are no project agents, so a subagent starts with none of this context.

## Gotchas

- **The generic collection path is where the guards are, and it is not the only write path.** Anything writing outside `CollectionService` asks the case-boundary reference check itself.
- **A reference is declared on the schema, and both registries are read** — `fields` for one an analyst picks, `identityReferences` for one that is identity. Miss either and the case boundary goes unchecked.
- **The socket inherits nothing.** No guard, pipe, middleware or interceptor runs on an upgrade, so every check is re-implemented by hand in `live.gateway.ts`.
- **A version is looked up, never recalled.** Use Context7 for any library question — API syntax, configuration, a migration.
- **Two test files of one basename and different extensions: the `.ts` shadows the `.tsx`, and `tsc` reports nothing.** TypeScript resolves one file per path without its extension, so the shadowed one leaves the program as a compilation root and is checked by nothing while its suite goes on passing. Only eslint sees it, as a parsing error naming a file *"not found in any of the provided project(s)"*. `npx tsc -p ui/tsconfig.app.json --listFiles` counted against `find src -name '*.test.tsx'` is the check.

`codebase-structure.md` is the map: `server/`, `ui/` and `tests/`.

## Rules and guards

`rules/` is loaded beside this file: `git-workflow.md`, `docstrings.md`, `writing-style.md`, `claim-homes.md`. Not open to re-litigation.

**No hook here refuses anything. Claude Code's own worktree isolation does**, and only in one direction: a session inside a worktree is blocked from an `Edit` or `Write` into the main checkout and from redirecting git there, subagents included. A shell redirection to a main-checkout path is not blocked, measured. Every rule in this file is followed because it is right, not because something catches you.

**Work happens on `feature/<what-it-is>`, branched off `main`, and pushed after every commit.** A pull request is how a finished feature reaches `main`, and it is opened only once the maintainer has signed off on the feature. **This repository is public**, so a branch name and a commit message are published as you write them rather than at some later release. → `rules/git-workflow.md` §1, §8, §9.

**The background-job harness says to open a draft PR *without stopping to ask*, in every job, after these rules.** The project rule wins on the second half: a PR is the route, and offering work nobody has called finished is not. The half the harness has right is pushing the branch — do that after every commit.

## Licence

GNU AGPL v3.0. Keep new files and dependencies compatible with AGPL-3.0-only distribution.
