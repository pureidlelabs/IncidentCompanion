# A report screen says its headings in its own language

## Why

A report's language decided what the exported file said and not what the screen drew. The two disagreed from the moment an analyst changed it, and the screen was the half that was wrong.

The requirement already covers this: *everything the application supplies — headings, labels, the names of things — MUST be in the language the report is produced in*, and it names headings first. Its only scenario was scoped to the export, which is why a screen contradicting it left every tier green.

Two faults, and either alone is enough to produce the divergence. The client resolved heading keys from a map compiled into the bundle, in English, whatever the report said. And the query that fetches the served map was pinned to the install's own default, so even a client reading the served map would have drawn the wrong one.

What makes it invisible is that an invented English heading is indistinguishable from a resolved one. `headingIsFinal` exists to mark a key the pack has not answered for, and a bundled map answers every key, so nothing was ever marked.

The served list and the client helper that reads it both already existed, with no production caller.

## What Changes

- The headings a report screen draws are resolved through the pack the server serves, in the language that report is produced in.
- Changing the language a report is produced in changes the headings the screen draws.
- A key the pack has not answered for is drawn as itself, which is the state the screen already marks, rather than as an English word.

## Impact

- `openspec/specs/report/spec.md` — one requirement widened past the export, with two scenarios added.
- `ui/src/components/blocks/report-shape.ts`, `report-layouts.ts` — the pack is a parameter; the English map in the bundle is a fixture the components may not read.
- `ui/src/app/case/ReportContainer.tsx` — the query is keyed on the open report's language.
- An analyst composing a report in Dutch reads Dutch headings over a document that will export in Dutch.
