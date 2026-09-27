# Evidence is reached through its case

## Why

An artefact's digest was a key to its bytes across the whole install. The store held every case's artefacts in one content-addressed directory, and the archive export and the report's figures resolved whatever digest a row or a frozen tree named against it. So any account could read another customer's evidence by naming a digest: import an archive whose evidence row carries it, then export that case with its files or render its report. It held after the analyst's reach was withdrawn and after the case holding the bytes was deleted, and the export's count of what it could not find told a held digest from an absent one. -> #1160

Digests are not secrets here. The evidence list returns them to anybody who reads the case, the report's register prints them, and an archive written without its attachments carries every one, so re-reading a handover returned exactly what it had withheld.

Nothing removed an artefact either. A deleted case left its bytes on disk, and bytes whose row was deleted or replaced stayed for the life of the volume. -> #10

The owner's rule is the requirement this change writes down: possession of an identifier, a digest or a reference does not by itself confer authority.

## What Changes

- **state**: a requirement that an artefact is reached only through the case that stored it, that nothing produced says whether another case holds it, that the same bytes in two cases are held by each, and that what nothing in a case names does not outlive the next start.
- **state**: the scenario on storing the same bytes twice is scoped to one case.
- **case-archive**: reading an archive gives the new case only the artefacts the archive carries, with a scenario for an archive naming a digest it does not carry.
- No change to **cases**: its deletion scenario already names a case with evidence; the test it cites now attaches an artefact and asserts it gone.

## Impact

- `server/src/evidence/` holds each case's artefacts apart, and every method takes the case.
- Every reader asks through its own case: the download, the report render and everything drawn from it, the archive export and the census.
- An import stores what an archive carries in the case it creates.
- A deleted case takes its artefacts with it, and at start the install removes what nothing names.
- An artefact attached in two cases is stored twice. The directory layout changes and the old one is not read; no install exists to carry forward.
