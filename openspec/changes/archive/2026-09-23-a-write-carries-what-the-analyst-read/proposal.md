# A write carries what the analyst read

## Why

The server's version check is sound, and the client handed it the wrong version. The Overview sent a field another analyst had just saved at the version the repaint brought, so the server took it and the other analyst's value was gone with nothing on screen. The compliance record wrote every keystroke against whatever version sat in the cache when it left, so one analyst alone was refused against their own earlier keystrokes and stored `ls` for `loss`. A selection took its versions when confirm was pressed rather than when the rows were read, so a row another analyst edited while the dialog was open was deleted or overwritten. A refused write put a snapshot back that could hold another refused value. A refusal in a dialog named no field and could not be answered. And a screen whose connection had dropped went on presenting itself as current. (#1161, #1110, #134)

## What Changes

- A write states the version its value was read at: a field's change holds the version it was begun against, a selection holds the versions its rows were drawn at, and a dialog holds the row as it opened. A record served again moves that version only where the field being changed did not move.
- One analyst's writes to one record leave in the order made, each against the version the previous one produced, so nobody is refused against their own write.
- Where two analysts change the same field, the field keeps what this analyst put there and shows the other value beside it, with a choice between the two. Leaving the field chooses nothing.
- A screen holds only what the server answered. No write is drawn before it is answered and no snapshot is put back after a refusal.
- A refusal in a dialog keeps the dialog open with what was typed, names the field that moved and whose value it holds, and can be answered in place. The screen-level refusal bands with nowhere to come from are removed.
- Compliance text and number answers are written on leaving the field, as the Overview's are.
- A row another analyst holds says who holds it and stays editable.
- A case screen says when it is not live: while its connection is down, and until what changed while it was down has been read again.
- The install states how long a lost connection's name stays on the roster.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `state`: a version is what a write is checked against, and the version a write states is the one its value was read at.
- `collections`: a selection is acted on as it was read.
- `live`: a claim warns and leaves the entry editable; a screen whose connection is down says so.

## Impact

- `ui/src/api/`: one door for every versioned write, the hooks behind it, and the per-field holds a form keeps.
- `ui/src/components/blocks/`: the record form, the compliance controls, the entity dialog, the bulk bar, the delete confirmation, the entity table, the merge review, the row actions and the case frame.
- `ui/src/app/case/` and `ui/src/screens/`: every container and screen that writes a versioned row.
- `server/src/domain/about.ts` and `server/src/health/about.controller.ts`: the presence bound is served.
- No wire contract a version check reads changes.
