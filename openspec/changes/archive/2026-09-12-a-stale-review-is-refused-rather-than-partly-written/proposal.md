# A stale review is refused rather than partly written

## Why

An import whose approval named rows the server no longer recognised wrote nothing and answered `201`. The analyst was told the import succeeded and the case was untouched.

A candidate's id is derived from the incident key and the row's identity rather than minted and kept, which is deliberate: a commit resends the payload and recomputes, so an id that changed between the two calls would approve a different row than the one shown. That reasoning is right, and it is an argument for noticing a mismatch rather than for ids that never change. Anything altering a row's identity between the preview and the commit alters its id, and selection by set membership answers *not selected* to an id nobody recognises.

A partial mismatch is the worse half: the rows that still resolve are written, the rest are dropped, and the counts reported are of what was written rather than of what was approved.

## What Changes

- An approval naming rows the import no longer proposes is refused, saying the review is out of date.
- A correction addressed to a row the import no longer proposes is refused the same way. It was dropped just as quietly, and the row was then written with the value the analyst edited away.
- Nothing is written by a refused commit.

## Impact

- `openspec/specs/incident-import/spec.md` -- one requirement gains two paragraphs and two scenarios.
- `server/src/incident-import/import.service.ts` -- one check, before any write.
- An analyst holding a preview across a deployment that changes the identity rules is now told to run the review again, where before they were told the import had succeeded.
