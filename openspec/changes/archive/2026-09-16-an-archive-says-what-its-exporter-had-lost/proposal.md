# An archive says what its exporter had lost

## Why

An archive states, in its own manifest, what the case recorded and the install writing it could not find. The import reads that list and drops it:

```
$ rg -n 'readArchive|\.missing\b' server/src --glob '!*.test.ts'
server/src/case-archive/import.service.ts:137:    const { members, attachments } = await readArchive(plain, {
server/src/archive/format.ts:275:  return { members, attachments: manifest.attachments, missing: manifest.missing ?? [] }
```

What the operator is told instead is recomputed from the digests that did arrive, which cannot separate the two states that produce an evidence row with no bytes behind it. A handover left the artefacts behind on purpose, and whoever exported it still holds them. An artefact the exporting install had already lost is held by nobody, and asking the sender for a copy answers nothing.

The requirement covering what an import says about completeness counts both as one number, so the application has no reason to carry a distinction the manifest already states. → #652, #731

## What Changes

- Where the archive states that the install which wrote it recorded material and could not find it, reading MUST say so apart from what the archive was written without.
- It reaches the operator, like the counts beside it, rather than only the response.
- Neither is a refusal and neither says the archive is at fault.

## Impact

- `openspec/specs/case-archive/spec.md` — one requirement altered, with two scenarios added.
- `server/src/case-archive/import.service.ts` — the import reads the archive's statement and carries it on the result.
- `ui/src/api/useImportCase.ts`, `ui/src/components/blocks/notify.tsx` — the field crosses the wire and is said out loud.
- Not changed: what the export decides it could not find, which already names every artefact.
