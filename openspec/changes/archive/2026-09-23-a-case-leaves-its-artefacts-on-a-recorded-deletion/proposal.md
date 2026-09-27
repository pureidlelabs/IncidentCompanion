# A case leaves its artefacts on a recorded deletion

## Why

The start removed every case directory whose case the database did not list, reading absence as deletion. An install started against a database that was rebuilt, or restored from an older copy, lists none of the cases beside it, so the first start removed their artefacts. The database copy an operator then restored named artefacts that were gone, and the evidence volume is often the only copy of them. That breaks the recovery requirement's promise that a restored install has every case's evidence as it was.

A deleted case already leaves a record of its deletion that outlives it, which is positive knowledge that the case is gone. Demonstration content leaves no such record, so what removes it has to remove its artefacts too.

## What Changes

- **state**: the requirement that an artefact is reached only through its case says that a database not holding a case is not that case's deletion, with a scenario for an install starting beside such a database.
- No change to **cases**: its scenario for removing a demonstration already says it leaves nothing behind; the test it cites now puts an artefact on the case and removes it both ways, by deletion and by the demo rebuild.

## Impact

- The start removes a case's artefacts only when the install recorded deleting the case; bytes inside a case the database holds are removed as before.
- The demo rebuild removes the artefacts of the demonstrations it deletes, and the seed one-shot mounts the server's evidence volume to do it.
- What an earlier layout left outside any case directory is removed at start.
- Storing bytes a case already holds counts as storing them now, for the grace a fresh upload is given.
