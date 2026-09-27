# A second case can be started from one incident

## Why

The door seeded a new case's reference from the incident's own number, and a reference is unique within its customer. So one incident could start exactly one case: every later attempt was refused as the case was written, naming a field the wizard does not offer.

The code is fixed. Nothing in `openspec/specs/` says it must stay fixed — the start-a-case requirement speaks to what the case holds and not to how many cases an incident may start, so re-introducing the seed would break no stated requirement and no scenario would go red.

## What Changes

- Starting a case from an incident states that the incident is not used up by it: the same incident may start another case.
- What the application composes for a new case must not be anything it is required to keep unique, since a value taken from the source repeats every time the source is used again.

## Impact

- `openspec/specs/incident-import/spec.md` — one requirement gains two scenarios.
- No code change: this records behaviour the branch restores.
