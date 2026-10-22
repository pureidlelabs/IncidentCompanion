# A re-import does not write an alert twice

## Why

An import matches its entities against the case and writes its timeline against nothing, so importing an incident a second time leaves one copy of each host and account and two copies of every alert. The timeline is the surface the product is built around, and the second run reports the duplicates as rows it added:

```
Imported. 3 row(s) added to the case. 6 row(s) were already in the case.
```

The two figures also count different things — the added one is entities plus timeline, the skipped one is entities alone — so a reader cannot reconcile them.

A second run is the ordinary case rather than a mistake: an import that failed at the timeline is retried, and an incident the platform has added alerts to is imported again to pick them up. Both are asked for by the requirements already, and the timeline half of each doubles the case.

The specifications say the present behaviour is right. *For a collection whose rows are events rather than things, every imported row MUST be a new row*, and the collections spec puts it more strongly: *sameness MUST NOT be inferred at all*. That reading is about the store and about two entries an analyst wrote, where it holds: two occurrences are two facts and merging them loses one. It is wrong about a platform re-sending the record of one occurrence, which is one event however many times it is sent.

## What Changes

- An import recognises the entries an earlier import of the same material wrote, and does not write them again.
- What it recognises is its own earlier work. An entry an analyst wrote is theirs, and an import proposes its own entry beside it rather than treating it as already held.
- What the import reports accounts for every approved row: a row it recognised is counted as already there rather than as added, whichever collection it belongs to.
- The store is unchanged. Two identical entries written through any door are still two rows, and nothing merges them.

## Impact

- `openspec/specs/incident-import/spec.md` — the matching requirement gains the timeline and the count that reconciles; the scenario asserting a re-imported event is always a new row is replaced.
- `openspec/specs/collections/spec.md` — the same scenario read from the store's side, narrowed to what is supplied rather than to what an import proposes.
- `server/src/incident-import/import.service.ts` — the timeline candidates carry what the case already holds, as the entity candidates do, and the write skips and counts them.
- `server/src/domain/incident-import.ts`, `ui/src/app/case/ImportSentinelContainer.tsx` — a timeline candidate says what it matched, so the review draws it as a merge rather than offering it as new.
- Not changed: `domain/identity.ts`. The timeline has no identity rule, the spreadsheet door asks the same question of the same module, and giving it one there would change what every door calls the same row.
