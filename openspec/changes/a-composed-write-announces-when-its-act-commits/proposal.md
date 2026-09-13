# A composed write announces when its act commits

## Why

*A write MUST record who made it, MUST be refused where the row moved since the writer read it, and MUST announce that the row changed — and these MUST succeed or fail together.* That is already the requirement, and a write composed into a larger act failed the third part of it: it announced nothing at all, so an import that created a case and filled it committed and told nobody, and every screen already open stayed as it was.

Announcing nothing was a remedy rather than an oversight. A composed write has not landed when it returns — its own commit is a released savepoint — so announcing there sends a subscriber to read what a rollback may still remove. Both ways of getting it wrong are silent, and the write path offered no third.

What was missing is a place for the announcement to wait. An act that collects what its writes would have said and says it after the commit makes the rule unnecessary rather than unwritten, and it removes the per-call-site guard that each composing author had to know to write.

The second half is that composition has to be declared. A caller that opens a plain transaction and passes the handle down has nowhere for the announcement to wait, and both ways of carrying on are the failures above — so that is refused instead.

## What Changes

- A write composed into a larger act announces when that act commits, and not before it or at all where it does not.
- Composing a write into a transaction nothing declared as an act is refused.
- A wait for a database connection has a deadline, so the failure that used to hang for ever now says what it was waiting for.

## Impact

- `openspec/specs/collections/spec.md` — one requirement gains two paragraphs and three scenarios.
- `openspec/specs/collections/design.md` — where the announcement waits, and why composition is declared.
- `openspec/specs/incident-import/design.md` — a paragraph stating the old rule, corrected.
- `server/src/db/act.ts` — new: the act, and the register.
- `server/src/collections/collection.service.ts` — one announcement path instead of a guard at each composed call site.
- `server/src/db/client.ts` — `connectionTimeoutMillis`.
- An analyst with a case open is told when somebody's import fills it, which they were not.
