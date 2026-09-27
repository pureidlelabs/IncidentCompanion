# Scope

**Preparation cannot tell a rename from a removal and an addition.** Such a change is refused like any other that would lose data, until generated migrations exist (#1086).

**A copy is checked against what was written when it was taken.** Damage the install itself held when the copy was taken is the artefact census's to report, not the copy's.

# Design

## Preparation never waits holding a table

Preparation opens its transaction by taking every table at once without waiting. If any table is in use it gives everything back and tries again shortly, for a bounded time, and then fails having changed nothing. Once it holds them all it waits on nothing else, so it can never be one side of a deadlock: a write or a read arriving meanwhile waits for it and then sees the rules as committed.

## A rename-shaped change is refused, naming both sides

Where the store holds an entity of some kind that the declared shape lacks, beside a declared one of the same kind the store lacks, the planner cannot tell a rename from a removal and an addition. Preparation refuses that change with the store's own code for a refusal, listing the entity on each side, and changes nothing.

## A copy carries the digest of each part as written

Taking a copy records a digest of the database dump, the evidence archive and the shape. Checking a copy first compares each part with its recorded digest, which refuses damage that leaves a part readable, then restores the database into a scratch database and requires every artefact it names to be in the archive, which refuses a copy that was already short when it was written.
