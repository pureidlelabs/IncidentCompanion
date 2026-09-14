# The demo takes the body the app sends

## Why

`evaluation` already requires that a write is accepted exactly when an install would accept it. Both of its scenarios covered only the refusing half, and a build that refuses *everything* satisfies those — which is what shipped: every row edit in the published demo answered 422, because the handler judged the whole PATCH body under a strict patch schema and every write the client makes carries a `version` that is not a column.

The suite was green because its own fixture sent a body the application never produces.

The accept half has no scenario, and that is the hole the defect fell through.

The case route had the opposite fault and then a subtler one. It had no schema at all; judging it by the served list of writable *field names* closed the reported gap and left values unchecked, so a case could hold a status no install can produce. `evaluation/design.md` already refuses that shape — *the rules an install judges a write by are the ones the evaluation build judges it by, the same rules, not a copy of them* — and `schema-identity.test.ts` enforces it for every collection. A case is not a collection, so that sweep cannot see it.

## What Changes

- The evaluation build accepts a write an install would accept, and that is stated as a scenario rather than assumed.
- A case write is judged by the install's own rule, values as well as field names, reached through the door the client is allowed to import from.
- A refusal carries the words and the fields an install's refusal carries, so a screen meeting one draws what it would draw against an install.

## Impact

- `openspec/specs/evaluation/spec.md` — one requirement widened, with two scenarios added.
- `server/src/domain/case.ts` — the case patch schema moves here, beside the form it derives from, and both the route and the evaluation build read it.
- `server/src/domain/collections.ts` — re-exported through the door the client has, as `patchSchema` already is.
- `ui/src/demo/handler.ts` — the version rides with a patch rather than being judged as a field; the case route is judged by the install's rule.
- An analyst evaluating the product can edit a row.
