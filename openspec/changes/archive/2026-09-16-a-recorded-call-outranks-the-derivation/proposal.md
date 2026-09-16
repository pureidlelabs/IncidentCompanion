# A recorded call outranks the derivation

## Why

An analyst can record whether a NIS2 incident is significant. The field is on the compliance schema with a vocabulary, on the table, in the demo fixtures and on the compliance screen, and the one function that reads it is called by nothing:

```
$ rg -n -w "statedDetermination" server/src ui/src
server/src/compliance/nis2.ts:336:export function statedDetermination(row: ComplianceRow): string {
```

So an analyst who records that an incident is significant is told by the assessment that it is undetermined, and the readiness line goes on asking them for the answer they already gave.

**The call under Article 23 is the analyst's, not the application's.** The specification already says the application assesses and the organisation reports, and that an assessment must not be a number or a score *because the analyst is the one who will defend the decision to a regulator*. A derived verdict that overruled a recorded one would be the application asserting law. What was missing is the requirement saying so, which is why the field could be collected and ignored without anything going red.

## What Changes

- A determination the analyst records is the one the assessment carries, whatever the criteria derive.
- The assessment says the verdict was recorded rather than derived, so a reader can tell the two apart.
- Whether the regime applies at all is not the analyst's to record here: scope still governs, and an entity nobody has classified stays undetermined whatever was recorded against it.

## Impact

- `openspec/specs/compliance/spec.md` — one requirement added, with two scenarios.
- `server/src/compliance/nis2.ts` — `significance()` consults the recorded call before deriving; both its callers, the verdict and the readiness line, are fixed by that one change.
- `server/src/compliance/gates.ts` — `unanswered` is removed. It is the mirror of `deciding` and nothing has ever called it. → `rules/no-legacy.md`
- Only NIS2 records a call today. DORA and GDPR derive, and neither has a field for the analyst to record one, so nothing there changes. → design record
