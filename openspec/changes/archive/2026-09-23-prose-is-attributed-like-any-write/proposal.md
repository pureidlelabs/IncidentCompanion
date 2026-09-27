# Prose is attributed like any write

## Why

Prose written over the case connection was stored with nobody's name on it: the report kept naming whoever last changed it through the collection routes, and neither the case's record of changes nor the install's audit said who wrote a conclusion. Article II asks that who made every change be recoverable, and the connection gave none of the guarantees the collection routes give while nothing excepted it. A note's words had a second writer besides: a change to them through the collection routes was answered 200 and replaced by the next save of the note's prose (#366).

## What Changes

- Every saved change to prose names each analyst who wrote into it, on the record, in the case's record of changes in the same act as the words, and in the install's audit; somebody who only read is named nowhere.
- A field derived from a record's prose is taken as its first words on create and refused on every later write, naming the field.
- A record opened for the first time keeps its first words once, however often a client that saw them reconnects.

## Impact

- `openspec/specs/live/spec.md`: one requirement added.
- `openspec/specs/collections/spec.md`: one requirement added.
- `openspec/specs/live/design.md` and `openspec/specs/collections/design.md`: what attribution records, and the single writer of a derived field.
- `server/src/prose/`, `server/src/live/live.gateway.ts`, `server/src/collections/`.
- A write naming a note's words through the collection routes answers 422 where it answered 200.
