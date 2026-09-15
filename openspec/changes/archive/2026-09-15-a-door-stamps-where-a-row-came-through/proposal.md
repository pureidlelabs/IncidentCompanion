# A door stamps where a row came through

## Why

A row records where it came from, and every door that writes rows an analyst here did not type answers it. A CSV import names the file, an incident import names the platform, and a timeline entry brought in either way is marked imported and unreviewed until somebody here reads it.

The archive door answers nothing. It copies every field the archive states that matches a column, and where a row came from is three columns, so the file's answer is what is stored. An archive is truthful about the install that wrote it, and each of those three answers about the install reading it:

| what the file says | what it means here |
| --- | --- |
| a row the other install's platform found | this install's platform found nothing |
| a row an analyst there typed | an analyst *here* typed it |
| an entry somebody there has read | somebody here has read it |

The last is the one with a cost inside a case. `unreviewed` is what an analyst filters a freshly imported timeline by, and a case arriving from elsewhere arrives with every entry already claiming to have been read.

Dropping the three instead of copying them is not the answer either. The column for where a row came from defaults to the analyst's own work, so a door that neither carries nor stamps writes that claim over every row it brings in — which is the same falsehood, reached by omission.

## What Changes

- Where a row came from is one of the things an archive may not decide, alongside what a row is called internally, who wrote it and what version it is at.
- An archive read in records that its rows came through the archive, whatever the archive says about where they came through before.
- A timeline entry read in from an archive is marked imported and unreviewed, as one read in from any other door is.

## Impact

- `openspec/specs/case-archive/spec.md` — one requirement widened by a sentence, with one scenario.
- `server/src/db/import-stamp.ts` — new: what a door asserts about a row, narrowed to the columns the target table has.
- `server/src/case-archive/rows.ts`, `server/src/case-archive/import.service.ts` — the three stop being columns the archive supplies, and the door stamps them.
- `server/src/exports/import.service.ts`, `server/src/incident-import/import.service.ts`, `server/src/collections/timeline.controller.ts` — the three doors that already stamped now stamp through the one answer.
- An operator handing a case to another install loses which rows that install's platform found. No column holds that fact, and the one that looks like it holds which door the row came through. → #727
