# A figure is refused where it is written

## Why

Widening the compliance figures to `int8` removed a guarantee the narrower column had been making by accident: that a stored value is inside the range the application can read back.

The read does not simply refuse an oversized figure. It is handed a different one first -- the value is converted to a number on the way out, and past a point that conversion rounds. The rounded value is then refused, so the case stops answering over a figure that is neither what was written nor anything an analyst can act on, and the remedy is a database edit.

That decides which end to make agree. Tolerating the figure at the read would draw a number nobody stored.

## What Changes

- A figure past what the install can read back is refused where it is written.
- The refusal holds at the store, so a figure arriving by a route that does not validate is refused too -- an archive brought into the install being the case that matters.
- A figure at the limit is stored and read back unchanged.

## Impact

- `openspec/specs/compliance/spec.md` -- one requirement added.
- `openspec/specs/compliance/design.md` -- the note saying the column is the only ceiling, which is no longer true of either half.
- `server/src/db/schema/` -- the figures' columns, and the check each table declares.
- An archive carrying such a figure is refused where it was previously stored and unreadable afterwards.
