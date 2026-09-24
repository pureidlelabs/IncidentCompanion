# A reorder is checked like any bulk write

## Why

A reorder named every row and carried no version, on the reasoning that the whole list is the intent. Two analysts reordering one report's sections at once were both answered as if their order had been kept, while what was stored was an order neither sent, sometimes with two sections on one position, and crossed orders failed with a server error. A reorder is a bulk write, and a bulk write carries every guarantee a single write carries.

## What Changes

- A reorder carries the version each row was read at, and is refused whole, naming the rows that moved, where any has moved since.
- Two reorders of one set of rows at once end with one of them stored whole and the other refused; never a mix, never a tie, never a server error.
- The screen that reorders sends the versions it holds and, refused, puts the order it showed back and says so.

## Impact

- `openspec/specs/collections/spec.md`: one requirement gains a paragraph and a scenario.
- `openspec/specs/collections/design.md`: the order an analyst chose is written under the version check.
- The reorder route's body changes from a list of ids to a list of rows with versions; `server/src/collections/`, `ui/src/api/useEntryReorder.ts`.
