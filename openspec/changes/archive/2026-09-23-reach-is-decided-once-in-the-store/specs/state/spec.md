# State

## MODIFIED Requirements

### Requirement: The application cannot reach a row it should not, even by mistake

The store MUST refuse rows outside the boundary the caller reaches, rather than returning them to an application trusted to filter.

The identity the application connects as MUST NOT be able to bypass that refusal. It MUST NOT be the identity that owns the schema, and MUST NOT hold the privileges that would let it read past a boundary or change the rules that define one.

Reading and changing case data MUST carry which case it is for and who is asking, established once per operation, so that no individual statement is where the boundary is remembered. The store MUST refuse a row to an operation that names nobody as asking, and to one naming somebody who does not reach the case.

#### Scenario: A query forgets its boundary

- GIVEN an operation reading case data
- WHEN a statement within it does not name the case
- THEN it returns nothing rather than everything

#### Scenario: The application attempts to widen its own reach

- GIVEN the identity the application connects as
- WHEN it attempts to disable or alter a boundary rule
- THEN the store refuses

#### Scenario: A new table holding case data is added

- GIVEN a new table holding rows belonging to a case
- WHEN it is added without a boundary rule
- THEN that omission fails loudly rather than serving every case's rows

#### Scenario: An operation names a case its caller does not reach

- GIVEN an operation acting for an analyst
- WHEN it names a case whose customer that analyst does not reach
- THEN the store returns none of that case's rows
- AND refuses a row written into it

#### Scenario: Nobody is named as asking

- GIVEN an operation reading or changing case data
- WHEN it names nobody as asking
- THEN it is refused rather than served
