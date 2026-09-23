# One import proposes one row per thing

## Why

An import of two incidents naming the same host wrote the host twice. The matching that existed was against what the case already holds, and the requirement says exactly that — so nothing was violated, and the second incident's host was correctly `new` against a case that did not hold it yet.

The missing property is about one import rather than about the case: several incidents naming one thing propose it once. An analyst reviewing such an import saw two rows saying the same host, approved both because both looked new, and read one host afterwards only if they noticed.

Matching within the plan and matching against the case are the same question asked of two indexes, and the CSV importer already answers both — it adds each accepted row to the index as it goes. The identity module's own interface says so: *two incoming rows that match each other are handled by the caller adding to this index as it accepts them*.

Which incident the surviving row belongs to is the part worth stating. The preview groups by incident and a row has to be attributable to one, so the first incident that proposed it keeps it. The alternative — collapsing at the point of writing and leaving the preview showing two — is the one that reads as correct and is not: it makes the analyst approve a row that is never written.

## What Changes

- Several incidents in one import naming one thing propose it once, before anything is written.
- The surviving row is attributed to the first incident that proposed it, and the others' events link to that row.

## Impact

- `openspec/specs/incident-import/spec.md` — one requirement added, with three scenarios.
- `openspec/specs/incident-import/design.md` — the index the plan keeps of itself, and the attribution rule.
- `server/src/incident-import/import.service.ts` — the plan indexes its own rows as it goes, keyed the way the case's are.
- An analyst importing several incidents from one intrusion reviews one row per host, not one per incident that mentioned it.
