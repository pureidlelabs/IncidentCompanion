# An import says how complete the case it made is

## Why

An archive import drops a reference that resolves to nothing and tells the operator nothing about it. The rows all arrive; some of the links between them do not, and the receiving analyst cannot see that by opening the case — every row is there.

The CSV door already counts what it could not carry and says what kind of thing it pointed at. The archive door counts nothing:

```
$ rg -n 'referenceCounts' server/src
server/src/collections/bulk-delete.service.ts:57:export async function referenceCounts(
server/src/collections/bulk-delete.controller.ts:34:import { referenceCounts } from './bulk-delete.service.js'
server/src/collections/bulk-delete.controller.ts:123:    const held = await referenceCounts(this.collections.database, caseId, targets)
```

One call site, and it is the bulk-delete door.

**A count like this reads as damage, and that reading would be wrong**, which is why the obvious version of it was built for #651 and taken back out before being offered. A dangling id in a reference list is the ordinary state of a case: those lists are `jsonb` and nothing scrubs them when a row is deleted, so a sound export of a case an analyst has tidied carries ids that resolve to nothing. An analyst deletes an account a timeline entry names, exports, and the import would report damage to a file that is perfectly sound.

What is true whichever cause produced it is *this case names rows that are not in it*, and that is the thing worth telling.

The same is already true of attachments — an archive exported without its files imports cleanly and its rows go on naming evidence that is not there — and no requirement covers that either. One requirement covers both.

## What Changes

- Reading an archive MUST say how much of what the case names is in it: the attachments its rows name and it did not carry, and the rows its rows name that it does not contain.
- Neither is a refusal and neither says the archive is at fault.
- The operator is told both, because a count the interface drops reaches nobody.

## Impact

- `openspec/specs/case-archive/spec.md` — one requirement added, with two scenarios.
- `server/src/case-archive/import.service.ts` — `remapped` answers what it dropped; the import totals it and the result carries it.
- `ui/src/api/useImportCase.ts`, `ui/src/components/blocks/notify.tsx` — the field crosses the wire and is said out loud. The reporter branched on the attachment count alone, so a new field would have reached nobody.
- Not changed: the reference lists themselves. Scrubbing them on delete would make a dangling id a real fault and this count a real signal, and that is a write-path change. → #731
