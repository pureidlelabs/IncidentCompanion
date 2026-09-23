# Tasks

## 1. The tests, red first

- [ ] 1.1 Browser specs driving two analysts, one analyst over a slow link and a selection acted on as read, against the real client and server; red on the old client for the reason each names
- [ ] 1.2 Composition tests driving the real containers, hooks and request layer with real latency; red on the old client
- [ ] 1.3 Unit tests of the write chain and the field reconciliation, and a rule holding where a read version is minted

## 2. One door for a versioned write

- [ ] 2.1 Serialise one tab's writes to a record, chained through its own answers only; the chain test passes with the tab hidden
- [ ] 2.2 Route every versioned write through it and take the version from the caller as a read version; the compliance cache read is gone
- [ ] 2.3 Delete every optimistic cache write and snapshot restore; the answers-only test passes

## 3. Holds and collisions

- [ ] 3.1 Hold a changed field with the version it was read at and reconcile each served record; the reconcile table passes
- [ ] 3.2 Draw a collision beside the field with a choice between the two values, and write nothing on leaving it
- [ ] 3.3 The record form, the key times and the compliance record on holds; compliance text and numbers written on leaving
- [ ] 3.4 The entity dialog on holds, so a refusal keeps the draft and names the field; the screen-level refusal bands removed

## 4. Selections

- [ ] 4.1 Capture each selected row's version when the act is pressed, through the bulk bar, the delete confirmation and every screen's row delete
- [ ] 4.2 Route Evidence and Entities through the shared bulk writes; a row with a change in flight offers no second change

## 5. Claims and liveness

- [ ] 5.1 A held row names its holder and stays editable
- [ ] 5.2 The case frame says when it is not live and clears once the case is read again
- [ ] 5.3 Serve the presence bound the store enforces

## 6. Record

- [ ] 6.1 Ledger rows for every touched scenario, each citing a test that drives the real entry point
- [ ] 6.2 Sync into the specifications and archive the change; both validations report no failures
