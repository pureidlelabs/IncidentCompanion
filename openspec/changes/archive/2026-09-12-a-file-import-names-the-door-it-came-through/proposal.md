# A file import names the door it came through

## Why

Every row read out of a CSV claimed `manual` -- the word the screens use for a row an analyst typed in by hand. Nothing stamped the file door, so the column default stood.

Where a row came from is what an analyst reads to decide how far to trust it. A host that arrived in a spreadsheet from a customer and a host somebody typed in after a phone call are different evidence, and the application was saying they were the same.

`openspec/specs/incident-import/spec.md` requires that a row's account of its own origin is decided by the install rather than taken from the platform's data. Nothing said the same about a file, so the file door met neither half of it: it did not take the file's word, and it did not answer for itself either.

## What Changes

- A row written by importing a file says it came through a file, on every collection that records where a row came from.
- What a file says about its own origin stays unread. A file naming itself as some platform is not evidence of where it came from.
- A collection with no field for that answer records nothing, rather than a field it has not got.

## Impact

- `openspec/specs/data-exchange/spec.md` -- one requirement added.
- `server/src/exports/import.service.ts` -- the answer, and the check that the collection can hold one.
- No change to what a file may carry, or to which files are accepted.
