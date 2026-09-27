# An open connection is listening

## Why

The live capability says what admits a connection, what a reconnection owes and what ends one. It does not say that a connection the browser can already write to acts on what is written to it, and that silence cost a defect nothing could find.

A connection is accepted before the install has finished preparing it, and the browser is told it is open at the first of those two moments. A screen writes immediately: the first thing it sends is a request for the state it needs before it can draw anything, and after a drop it sends what the analyst typed while they were away. Those frames landed in the gap and were discarded, with no error anywhere and nothing to retry. A field opened beside its connection waited for an answer that never came, a reconnected editor never received what the others wrote while it was away, and prose typed offline was lost when the tab closed. -> #1107, #515

Order is the same property from the other side. Frames acted on concurrently finish in whatever order their work takes, so a claim and the release sent right behind it can finish release first, leaving the entry held for the life of the tab.

The property is not prose-specific and not first-connection-specific. Every kind of frame a screen sends goes through the same door.

## What Changes

- The live capability states that a connection the browser can write to acts on everything sent over it, in the order it was sent, and that what arrives while the install is still preparing that connection waits rather than being discarded.
- It states what happens when the preparation does not complete: the connection ends, and nothing sent over it is acted on.
- No change to what admits a connection, to what a reconnection owes, or to what ends one. Those requirements were already right; what was missing is the one between being accepted and being ready.

Adopted from the change in draft pull request #863, with the ordering scenario added.

## Impact

An analyst opening a screen that writes as soon as it connects is answered rather than left waiting, and an analyst who returns from a drop keeps what they typed and receives what they missed. The window that discarded those frames is closed at the door every frame goes through, so no screen has to know it existed.
