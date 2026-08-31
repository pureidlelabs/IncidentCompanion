---
name: dead-code-hunt
description: Hunt the repository for dead code and artifacts of removed features — orphan modules, exports nothing imports, dependencies nothing requires, subsystems kept green only by their own tests. Covers the Nest server and the React client. Use for a periodic sweep, after a feature is removed or replaced, or when a comment claims "no longer" and you want the full blast radius. The failure mode is twofold — declaring something dead that a registry dispatches by string, and trusting a green suite as proof of life when the only caller is the test.
---

# Dead code hunt

**Hunt `server/` and `ui/` — that is where dead code accumulates.** `app/` is a reference corpus that gets no features, so a corpse there costs nothing and removing it buys nothing. Its passes are kept below for a session that is *reading* the corpus, and they are not where a sweep starts.

**A reference count is not a liveness check.** A symbol here can be reached by `RESOLVERS[block.kind]`, by a slug through `sectionFor`, by a translation key `t('heading.<kind>')`, by a CSS selector in `lib/chords.ts`, or by a dynamic `require_('fontkit')` — and every one defeats a grep for the bare name.

**The most reliable tell is still a comment apologising for the corpse.**

```bash
rg -i "no longer|used to be|has no consumer|is retired" server/src ui/src --glob '!*.test.*'
```

## What already runs, so you do not re-derive it

Check these before reaching for a tool. Each is a real answer already in the tree.

| Instrument | Answers | Does not answer |
| --- | --- | --- |
| `ui/src/structure.test.ts` | a module imported only by its own test; a dependency only the spike needs | anything in `server/` |
| `server/src/architecture.test.ts` | an import resolving nowhere; a folder reaching a folder it may not | orphans — it checks the edge, never whether anything points *in* |
| `npm run lint` (both) | an unused local, parameter or import **inside one file** | an unused *export* — no `no-unused-modules` rule is configured |
| `ui` typecheck | the same, plus unused class members: `noUnusedLocals` and `noUnusedParameters` are on in `tsconfig.app.json` | exports again |

`ui/src/structure.test.ts` also carries an `openFindings` list — two modules it found and nobody has decided yet. **Read it first; those are hunt output already recorded.**

`cd server && npm run lint` finds no dead code of any kind, which is what the missing rule looks like.

## The passes, in order

### 1. knip, which is the one tool that answers the export question

Not installed, in either package. Run it pinned — an unpinned `npx` in a worktree fetches whatever the registry calls latest.

```bash
cd ui     && npx --yes knip@6.32.2 --no-progress
cd server && npx --yes knip@6.32.2 --no-progress
```

**Cost: 21 MB in `~/.npm/_npx`, and 2 seconds a run once cached.** It needs `node_modules` present, so a fresh worktree runs `.claude/scripts/worktree_setup.sh` first. It exits 1 whenever it has findings, so never gate a following command on its status.

What it printed here:

| | `ui` | `server` |
| --- | --- | --- |
| unused files | 6 | 15 |
| unused dependencies | 3 | 2 |
| unlisted dependencies | 3 | 7 |
| unused exports | 89 | 98 |
| unused exported types | 45 | 45 |

**The dependency rows are the highest-value output and they are nearly clean.** `selfsigned` in `server/package.json` is real — nothing outside the manifest names it, and it is what minted the certificate before nginx took TLS over. `ui` carries `zod`, `react-markdown` and `@tiptap/extension-bubble-menu` with no importer at all.

**Its false positives, all four seen here:**

- **A dynamic require.** `fontkit` reads as unused and `spine.ts` calls `require_('fontkit')` to draw the kill-chain spine. Grep the bare name before believing a dependency row.
- **An entry point nobody imports.** `src/seed.ts`, `src/repl.ts` and the ten `server/scripts/*.ts` are run, not imported; `vendor/redoc` is shipped bytes and `server/e2e/visual/probe.d.ts` is a declaration. **Fourteen of the server's fifteen "unused files" are one of those**, and the fifteenth, `domain/entities/case-facts.ts`, is the only real one.
- **The kit.** `alert-dialog.tsx`, `avatar.tsx` and `disclosure.tsx` are the tier the app is built out of, and the component ladder says the kit is the tier you do not hand-roll. Unused is their normal state; deleting one means re-adding it through the CLI.
- **`import type` across the tier boundary.** `ui` reads the server's wire types through the `@contract/*` alias onto `server/src/domain/*`. Run both packages before trusting either — knip scoped to `server` alone calls every entity type dead.

### 2. Orphan modules, which knip over-reports and you can check by hand

A file reached by no `import` in either tier. **Resolve `@/` and `@contract/`, and strip the `.js` a Nest import writes**, or the sweep reports live modules. Excluding tests, stories and the entry points above, the whole repository has **one** candidate, and it is not a defect: `server/src/domain/entities/case-facts.ts`, which `domain/wire.ts` documents as a deliberately unconsumed declaration - `rsitClass` and `rsitType` are served columns no live schema states. Confirm any candidate with `rg -n -w "<name>" server/src ui/src --glob '!*.test.*'` returning its own definition and a prose mention.

**Two more stood here and were deleted**, both second implementations rather than leftovers: a whole per-collection timeline hook superseded by the generic ones, and a graph sort key nothing called.

### 3. Unused class members, which nothing else sees

eslint's `no-unused-vars` skips class properties and the server's `tsconfig.json` does not carry the flags the client's does. Run them explicitly:

```bash
cd server && ./node_modules/.bin/tsc -p tsconfig.json --noEmit --noUnusedLocals --noUnusedParameters
```

**3 errors, all `private readonly`**: two `Logger` fields nothing logs through, and an injected `db` in `content.seeder.ts` whose only surviving mention is a comment. The client is clean under the same flags, because it has carried them since it was scaffolded (`cd ui && npx tsc -b --noEmit --force`, exit 0).

### 4. The false-positive gauntlet

A hit is *alive* if it is any of these. Check before reporting.

- **String dispatch.** `RESOLVERS` in `server/src/report/document/resolve.ts` maps 18 block kinds to functions — `case_header: caseHeader` is the only place `caseHeader` is named. `sectionFor(slug)` in `ui/src/app/case/section-elements.tsx` resolves a URL segment against the section registry, and `t('heading.<kind>')` resolves a label against `report/document/labels.en.ts`.
- **A selector standing in for a component.** `features/shortcuts/focusTargets.ts` reaches controls by `[data-slot="node-list-toggle"]` and `[data-testid="header-search"]`. The attribute and the constant never appear in the same file, so renaming either leaves both compiling and the chord silently dead. `ChordLayerContainer.test.tsx` is the only thing holding that pair.
- **A Nest decorator.** A controller, guard, interceptor, pipe or subscriber is registered by a module and called by name nowhere.
- **A Zod schema behind `@ZodResponse`.** The decorator is the only reader, and `architecture.test.ts` requires one per JSON route.
- **A Drizzle table or row type.** Persisted shape, not code.
- **A React prop type or a story.** A `*.stories.tsx` is collected by a glob; an exported `Props` interface is read by the component's own signature.

### 5. Transitive re-check

A private helper whose only caller was just declared dead is dead too. Re-run knip once after the cut rather than reasoning per symbol — the second run is 2 seconds and it reads the tree you actually have.

## Reporting first, then removing

The deliverable is a categorised report: **dead dependencies / orphan modules / dead exports / alive-only-through-tests / clean areas**. The alive-only-through-tests category is a judgement list — check `openspec/` for each name, because some of it answers a requirement nothing implements yet rather than being left behind.

One branch, one commit per subsystem, so each removal reverts alone. Per finding, in order:

1. **Re-verify at cut time, untruncated.** Another session may have grown a caller. **Never pipe a liveness grep into `head`** — a real caller below the cut reads as absence, and that has cost wrong verdicts here.
2. **Cut by exact-string Edit.** Never a regex to the next `export`.
3. **Retire the tests with the code**, behind a comment naming what went. When a dying test is the only holder of a live property, re-anchor it on the shipping path and break-verify the replacement *before* the old one goes.
4. **Delete the row from `openFindings` in `ui/src/structure.test.ts`** when the module it names goes. The test fails on a stale entry, which is the point.
5. **Sweep the prose.** `rg -n <symbol>` over comments, `openspec/` and `.claude/` — a specification describing the removed mechanism as current outranks the code it disagrees with.
6. **Land it whole**: `./verify.sh`, and `server/e2e/prodding.spec.ts` when the cut reached a write path or a form. The commit message carries what was removed and why it was dead.

The cheapest removal is the one that never needs this skill: when a landing *replaces* something, the predecessor is in scope for that landing.

## What no instrument here answers

- **A React component rendered by a registry you have not found.** knip resolves imports, so a component imported by `section-elements.tsx` and never dispatched to reads as alive. Nothing detects that; the check is reading the registry against the rail.
- **A CSS class.** Tailwind compiles `ui/src` at build time and a class assembled from data gets no CSS at all, so "unused" and "broken" look identical.
- **A `data-testid` with no reader.** Both halves compile and both greps succeed; only the browser tier can see the control that is never reached.
