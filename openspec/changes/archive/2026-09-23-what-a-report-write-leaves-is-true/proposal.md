# What a report write leaves is true

## Why

Three report writes left behind something other than what the specifications say. Prose typed a moment before a send was stored by the send under the sender's name alone, with no change record or audit line naming the analyst who typed it. An analyst's second reorder, made before the screen had read back what their first reorder changed, was refused by that first reorder and rolled back. And a sent report still changed when something it pointed at was removed: deleting the evidence a sent part draws, or the draft a sent report corrects, cleared the sent report's reference to it.

## What Changes

- Prose typed before a send is saved and attributed like any other save before the send holds the report still; a save that fails leaves the report unsent.
- A reorder answers with the version each row now holds, and one screen's reorders of a set of rows run one at a time, so an analyst's own reorder never refuses their next.
- Removing what a sent report points at is refused with the sent report's refusal; only a case removed with everything in it, and an account removed and its name cleared from what it wrote, pass the freeze.

## Impact

- `openspec/specs/live/spec.md`: one requirement gains a paragraph and a scenario.
- `openspec/specs/collections/spec.md`: one requirement gains a paragraph and a scenario.
- `openspec/specs/report/spec.md`: one requirement gains a scenario.
- `openspec/specs/live/design.md`, `openspec/specs/collections/design.md`, `openspec/specs/report/design.md`.
- The reorder route answers `{ rows: [{ id, version }] }` where it answered `{ ids }`.
- Deleting a piece of evidence a sent report draws, or a draft a sent report corrects, answers 409 where it answered 200.
