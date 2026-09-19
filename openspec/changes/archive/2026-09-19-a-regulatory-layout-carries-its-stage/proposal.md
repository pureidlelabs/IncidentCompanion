# A regulatory layout carries the step of the obligation it files

## Why

An analyst picking **NIS2 notification** gets a report with no regulatory stage on it. The client asks each layout for one and the route serves none:

```
$ grep -n "stage" server/src/report/offered-layouts.ts server/src/report/report.controller.ts
(nothing)
$ grep -n "stage" ui/src/components/blocks/report-layouts.ts
343:  export function stageOf(layout: ReportLayout | undefined, nis2Enabled: boolean): string
345:    return layout?.stage ?? ''
```

So `stageOf` answers `''` for all four regulatory layouts and the New report dialog writes `stage: null`, in the demo and on a real install alike.

**It cannot be repaired from the label.** Three of the four layout labels are a stage word for word and the fourth is not:

```
layout labels   NIS2 early warning | NIS2 notification | NIS2 intermediate | NIS2 final report
REPORT_STAGES   NIS2 early warning | NIS2 notification | NIS2 intermediate | NIS2 final
```

A string match would set three stages and silently drop the one that closes the obligation — the worst of the four to lose, since a regulator's file stays open on it.

**Nothing in the specifications says a report created under a regime records which step of it the report is.** The compliance capability says which submissions have been made must be tracked against the case; it does not say the report itself carries its step. That silence is why the field could exist on the wire, be read by the client, and be served by nothing without any requirement going unmet.

## What Changes

- A layout that belongs to a regulatory regime states which step of that regime's obligation it files, and a report created from it records that step without asking the analyst to restate it.
- A layout belonging to no regime states no step.
- The step is a value of the stage vocabulary the report already validates against. It is declared rather than derived from anything an analyst can retitle.

## Impact

- `openspec/specs/report/spec.md` — one requirement added, with the scenarios that would show it false.
- `server/src/library/builtins/report-layouts.ts` — the four regulatory layouts declare their stage.
- `server/src/library/library.service.ts`, `server/src/report/report.controller.ts`, `server/src/report/offered-layouts.ts`, `server/src/demo-catalogue/api-catalogue.ts` — the value travels the hops `requiresFeature` already takes.
- `ui/src/api/reportLayouts.ts` — `stage` stops being optional: the route always answers with it, empty where no step applies.
- An analyst picking a regulatory layout gets a report that says which filing it is. Nothing an analyst has already typed changes, and the stage vocabulary is untouched.
