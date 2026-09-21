# An open connection is listening

## Why

The live capability says what admits a connection, what a reconnection owes and what ends one. It does not say that a connection the browser can already write to acts on what is written to it, and that silence cost a defect nothing could find.

A connection is accepted before the install has finished preparing it, and the browser is told it is open at the first of those two moments. A screen writes immediately -- the first thing it sends is a request for the state it needs before it can draw anything -- so that frame lands in the gap and is discarded, with no error anywhere and nothing to retry. The screen then waits for an answer that will never come. It looks like a slow load, it clears on a reload, and whether it happens at all depends on how long preparing the connection takes, which is why it was reported as an intermittent test failure rather than as a defect. -> #515

The property is not prose-specific and not first-connection-specific. Every kind of frame a screen sends goes through the same door.

## What Changes

- The live capability states that a connection the browser can write to acts on everything sent over it, and that what arrives while the install is still preparing that connection is held rather than discarded.
- It states what happens when the preparation does not complete: the connection ends, and nothing sent over it is acted on.
- No change to what admits a connection, to what a reconnection owes, or to what ends one. Those requirements were already right; what was missing is the one between being accepted and being ready.

## Impact

An analyst opening a screen that writes as soon as it connects is answered rather than left waiting. The window that discarded those frames is closed at the door every frame goes through, so no screen has to know it existed.
