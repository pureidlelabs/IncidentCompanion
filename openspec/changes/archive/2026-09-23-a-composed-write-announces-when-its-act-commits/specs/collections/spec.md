# Collections

## MODIFIED Requirements

### Requirement: Every write is attributed, checked and announced as one act

A write MUST record who made it, MUST be refused where the row moved since the writer read it, and MUST announce that the row changed — and these MUST succeed or fail together.

A write that lands without attribution is a change nobody can defend. One that lands without the version check overwrites somebody. One that lands without the announcement leaves every other open screen believing something untrue. A write path that does two of the three is worse than one that does none, because it looks correct.

Where a write is composed into a larger act, the announcement MUST be made when that act commits, and MUST NOT be made before it or at all where the act does not commit. An announcement made before the act lands sends a reader to something that may be taken back; one never made leaves every open screen holding what the act replaced.

Composing a write into a larger act MUST be refused where nothing has declared that act, so that a write cannot quietly take either of those two wrong answers.

A refusal MUST say what the row is on now, so the writer can work out what changed.

#### Scenario: Two analysts write to one row

- GIVEN two analysts who read the same row
- WHEN the second writes after the first
- THEN it is refused with the row's current version
- AND the first analyst's change stands

#### Scenario: A write succeeds

- GIVEN an analyst changing a row
- WHEN the write lands
- THEN it carries who made it
- AND the open screens are told the row changed

#### Scenario: A write composed into an act that commits

- GIVEN a write composed into a larger act
- WHEN the act commits
- THEN the open screens are told the row changed
- AND they were not told before the act committed

#### Scenario: A write composed into an act that does not commit

- GIVEN a write composed into a larger act
- WHEN the act fails and is taken back
- THEN the open screens are told nothing

#### Scenario: A write composed into nothing that declared an act

- GIVEN a write composed into a transaction nothing declared as an act
- WHEN the write is attempted
- THEN it is refused
