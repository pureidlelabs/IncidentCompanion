# A copy is refused however it was damaged

## Why

A non-author review of the lifecycle work (#1159) found four ways the install still failed what the specifications ask, each reproduced:

- A copy whose evidence archive had one byte changed, at the same length, passed the check and would have been restored. The scenario for a damaged copy named only a copy cut short, so the ledger called it demonstrated.
- Preparation run again beside a write deadlocked with it: preparation held one table while waiting on another that the write held, and the write then reached for the first. Postgres aborted one of the two, the analyst's write or preparation itself.
- A stored column or index under a name the new version does not declare stopped preparation with an internal error naming nothing, rather than a refusal naming what would have been lost.
- The check that nobody is signed in after a restore passed whether or not the copy carried sessions, because the install it was restored into could not read the first install's cookie anyway.

## What Changes

- **A damaged copy** is refused whether it was cut short or altered after it was taken, and the refusal names the part.
- **Preparation never waits on a table while holding another**, so a write beside it waits and is never the one refused.
- **A name the store holds and the version does not declare**, beside one the version declares and the store lacks, is refused naming both.

## Impact

- `openspec/specs/state/spec.md`: the damaged-copy scenario covers alteration as well as truncation.
- `openspec/specs/deployment/design.md` and `openspec/specs/state/design.md`: how preparation takes its locks, how a rename-shaped change is refused, and what checking a copy compares.
- The schema step, the backup command, and the lifecycle and schema-step tests.
