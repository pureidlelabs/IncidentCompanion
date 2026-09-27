# A frame it cannot read stops nothing

## Why

An open connection acts on everything written over it, in order, and that promise covers every kind of frame. One frame broke it: a frame that parses but is not an object stopped the connection's sequence. Nothing written after it was acted on, and when the tab closed, the analyst stayed on the roster for as long as the install ran. The unhandled failure also ends a plain Node process, so any admitted analyst could restart the install with one frame. The review of pull request #1183 found it.

The requirement already said *every kind of frame*, but no scenario could show it false for a frame the install cannot read, so nothing was asked to show that it held.

## What Changes

- The requirement says that a frame the install cannot read, or fails to act on, is set aside, and that it stops neither what was written after it nor the connection's end.
- A scenario makes that falsifiable.

## Impact

A connection keeps acting on frames and still leaves the roster when it ends, whatever an earlier frame held.
