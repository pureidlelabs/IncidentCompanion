# Collections

## MODIFIED Requirements

### Requirement: Doing something to many rows obeys every rule that governs one

Acting on rows in bulk MUST carry every guarantee a single write carries: attribution, the version check, the announcement, the case boundary, and the reference check.

A bulk path MUST NOT be a faster path. Where speed and the guarantees conflict, the guarantees win.

Where part of a bulk act cannot be performed, the caller MUST be told which rows and why, and MUST NOT be left unable to tell what happened.

A selection MUST be acted on as it was read. The version each selected row states MUST be the one it had when the analyst chose it, never one read when the act is confirmed, so a row another analyst changes while the analyst is deciding is refused rather than deleted or overwritten.

#### Scenario: Some rows in a bulk write have moved

- GIVEN a bulk write over several rows
- WHEN some have changed since they were read
- THEN the caller is told which
- AND the outcome for every row is determinable

#### Scenario: A bulk write crosses the case boundary

- GIVEN a bulk write including a row from another case
- WHEN it is attempted
- THEN it is refused

#### Scenario: A row in a selection changes while the act is being confirmed

- GIVEN rows an analyst selected and asked to delete or change
- WHEN another analyst changes one of them before the first confirms
- THEN that row is neither deleted nor overwritten
- AND the first analyst is told which
