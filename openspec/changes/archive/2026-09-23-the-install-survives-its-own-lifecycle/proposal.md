# The install survives its own lifecycle

## Why

The shipped `compose.yaml` did not survive its first restart (#1159), each of these reproduced on the shipped stack:

- The store started only once on its own volume.
- A store restart ended the application, and nothing started a stopped component again.
- With the ephemeral store unreachable, health answered an unnamed 500.
- Every start re-ran preparation: tables briefly without their rules under a serving application, demonstration cases deleted and rewritten, every built-in rewritten.
- A shape that discards stored data was applied or refused depending on whether a terminal was attached.
- Parts of the install made outbound requests with nothing configured.
- No copy of a running install with its evidence could be taken or returned to.

The ledger claimed several of these demonstrated by tests that read the configuration rather than running it.

## What Changes

- **Preparation** brings the store forward in one act or not at all: run again on an unchanged install it changes nothing, a serving application never meets the store without its rules, and a shape that would discard or convert stored data is refused with the store untouched, from a terminal or not.
- **An install recovers on its own**: a component that stops without being asked is started again, the application outlives its stores' restarts, and once a store is back the install serves without anybody acting.
- **An install with nothing configured reaches nothing outside itself** over its whole life, preparation included, stated at the level of the install rather than per feature.
- **A copy is proven and refused when wrong**: a damaged copy fails verification, and a copy taken under another shape of the store is refused with the install left as it was.
- The lifecycle is demonstrated on the shipped stack by a tier of its own in the merge queue.

## Impact

- `openspec/specs/deployment/spec.md`: preparation's repeatability made measurable, recovery after a dependency returns, a component that stops unexpectedly, and install-wide Article V.
- `openspec/specs/state/spec.md`: two scenarios on recovery.
- `compose.yaml`, the preparation steps, the pool, the health route and a backup command. No stored data changes shape.
- Not decided here: how a release crosses a change that would lose stored data. It is refused, and generated migrations come later (#1086).
