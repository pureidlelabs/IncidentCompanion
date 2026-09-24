# A sent report takes nothing after its stamp

## Why

The freeze was a check each write path made before its own write, in a separate transaction, and only the paths somebody had remembered made it. The prose flush made none, so words typed as a report was sent reached the stored report and not the sent one, and a send racing a part edit could answer both 200 while the edit was missing from what left. Sending, correcting and restoring sections were each several acts, none of them recorded, and two restores pressed together put every section back twice.

## What Changes

- A sent report, its parts, their order and its prose take no write from any path; the refusal names the report and when it was sent.
- Sending is one act that stamps the report as it stood: a change answered as written before the stamp is in what was sent, and one landing while the document is produced refuses the send, naming what moved.
- Prose being typed while a report is sent is either in what was sent or refused to the typist; a send that fails keeps what was typed while it decided.
- Sending, correcting and restoring sections are each one act, recorded as a change naming who made it; two restores at once restore once.

## Impact

- `openspec/specs/report/spec.md`: four requirements gain paragraphs and scenarios.
- `openspec/specs/report/design.md`: where the freeze is held, how a send decides, and the boundaries it keeps.
- `server/src/db/schema/store-guards.ts` and every schema push, `server/src/report/`, `server/src/prose/`, `server/src/live/live.gateway.ts`, the archive import and the demo sender.
- A part write or prose frame that a sent report used to take is refused, and a send that used to succeed over a concurrent edit is refused naming it.
