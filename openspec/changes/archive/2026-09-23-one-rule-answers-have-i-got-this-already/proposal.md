# One rule answers "have I got this already?"

## Why

`collections/spec.md` already requires it, in the words this change's title borrows: *Where a collection has an identity, that rule MUST be one rule, used by every path that could create a row.* Three paths answered it three ways, so nothing is added to the requirement — the code was in violation of it.

The issue's own example does not reproduce, and what is there instead is worse. Both doors always agreed about *whether* a row was already held, and disagreed about *which row it was*: a file naming `Dropbox / tenant-b` matched the stored `tenant-a` row through one door and `tenant-b` through the other. An import writing onto the wrong record is worse than one writing twice.

**`keyOf` is not the ladder's weakest rung, and an earlier reading of this said it was.** Measured across every keyed collection: a `network_indicators` row with a value and a scope and no type has a `keyOf` that appears nowhere in its ladder, and a `malware` row with a filename and no hash has no key at all against a one-rung ladder. The two coincide on `systems`, `accounts` and `cloud_apps` and part on the other two, which is why indexing by the key alone looked harmless.

## What Changes

- Every path that asks whether a case already holds a row asks it the same way: the arriving row's strongest naming first, falling to weaker ones, against an index built from every naming a stored row answers to.
- A row is matched at the strongest rung it states. Matching at a shared weak rung is what reached whichever row happened to be indexed there.
- Where a case holds two rows answering to one naming, the first is kept, through every path.
- A malware row naming a file with no hash is recognised by its filename through the spreadsheet door, as it already was through the incident door. Two such rows in one file are one row.

## Impact

- `openspec/specs/collections/design.md` — the ladder and the first-wins rule, which were written down nowhere.
- `server/src/domain/identity.ts` — `namingsOf`, `matchIn` and `rememberIn`; `indexOf` records every naming.
- `server/src/exports/import.service.ts`, `server/src/incident-import/import.service.ts` — both ask the shared helpers; the incident door's own index builder and lookup are deleted rather than corrected.
- `server/src/exports/csv-import.ts` — the preview an analyst approves decides duplicates by the same rule, so it no longer offers as new a row the server will merge.
- An analyst importing one thing through two screens updates one record.

## What this does not settle

**What a replace writes once a row is matched on a rung weaker than the file stated.** A CSV naming `Dropbox / tenant-b` with `onDuplicate: replace` writes the whole arriving row onto whatever it matched, and matching is now deterministic where it was not. The issue names this as deserving its own reading, and it is a question about what a replace means rather than about which row is found. It stays open. -> #604

**The incident door's `enrich`.** A candidate's fields are widened after its match has been resolved, and it is not re-matched — so a second entity naming the same app more strongly keeps the first's match. That is a hole this change neither opened nor closed.
