# An archive row is checked before it is written

## Why

An archive is already checked against its own statement: member names cannot traverse, digests are verified, a member the manifest does not name is refused. That is the envelope, and it says nothing about the case record inside it. A hand-built `.iccase` whose manifest is correct matches its own statement perfectly, and its rows were copied field by field into typed tables on trust.

Measured against the shipping importer, an archive naming one system:

| what the row stated | what happened |
| --- | --- |
| a size no column can hold | a database driver error naming column names |
| an object where a hostname goes | stored, as the text `{"not":"a string"}` |
| a list where a hostname goes | stored, as the text `{"a","b"}` |
| a vocabulary value no schema defines | stored, and drawn on every screen that reads the field |

The refusal is the reported half and the smaller one. Five of six hostile rows were written, so what an analyst gets is not an error but a case that looks sound and holds values the application cannot mean. The vocabulary case is the worst of them: nothing downstream re-checks a stored value, so it reaches screens and reports.

The requirement this fails is not the envelope's. An archive that states what it holds, and holds it, can still state rows this build cannot write. What is missing is a property about the rows.

## What Changes

- An archive's rows are checked against the shape their collection declares, before any of them is written.
- An archive carrying a row this build cannot hold is refused whole, naming the collection, rather than reported as a database error or written in part.
- A field this build does not know is dropped rather than refused, so an archive from another build of this application still reads.

## Impact

- `openspec/specs/case-archive/spec.md` — one requirement added, with five scenarios.
- `server/src/case-archive/rows.ts` — new: the shape each collection's archive rows are judged by.
- `server/src/case-archive/import.service.ts` — the row is parsed rather than filtered by column name, and a value only the database can refuse is reported as a refusal.
- An operator importing a damaged or hand-built archive is told which collection it stopped at, and finds no case half-written behind it.
