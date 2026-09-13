# A caller does not choose how their own run is counted

## Why

A run of the same refusal reads as more serious than one of them, which is how one failed sign-in stays a typo and thirty become an attack. What makes two refusals *the same* included the name of what was asked for — and for a failed sign-in that name was the account the caller typed.

So a caller chose whether their own attempts were counted together. One password each at a hundred accounts was a hundred runs of one, from one address, in one window, every line at the lowest seriousness the vocabulary has. That is password spraying, and it is the shape a run exists to reveal.

The same rule is already written down twice in this capability, for an address a caller asserts and for a route a caller invents. This is the third instance, and the first where the value was one the install genuinely wanted to keep.

## What Changes

- What decides which run a refusal belongs to is the install's own, never the caller's.
- What the caller supplied is still recorded, somewhere that cannot separate one run into many.

## Impact

- `openspec/specs/install-audit/spec.md` -- one requirement gains a paragraph and two scenarios.
- `server/src/auth/auth.config.ts` -- a failed sign-in names the install and carries the account beside it.
- An operator reading the install's own activity screen sees the run and not the account, until that screen draws a line's detail. A collector already receives both.
