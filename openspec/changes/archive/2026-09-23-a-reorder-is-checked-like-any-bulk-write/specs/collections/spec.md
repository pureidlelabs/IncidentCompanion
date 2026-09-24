# Collections

## MODIFIED Requirements

### Requirement: Order an analyst chose is theirs, and is not a property of the data

Where an analyst arranges rows, that order MUST be recorded and MUST survive everything that does not change it: reading, filtering, another analyst's write elsewhere, an import.

Order MUST NOT be inferred from when a row was created or last changed, because editing an entry would then move it.

Reordering MUST be an attributed change like any other.

**Reordering is a bulk write, and carries the version check.** A reorder MUST state what each row it arranges was read at, and MUST be refused whole, naming the rows that moved, where any has moved since. The order stored MUST always be one somebody sent: never a mix of two, and never two rows on one position.

#### Scenario: An analyst reorders rows

- GIVEN rows an analyst has arranged
- WHEN one of them is edited
- THEN the order is unchanged

#### Scenario: Rows arrive from an import

- GIVEN rows an analyst has arranged
- WHEN an import adds more
- THEN the arrangement of the existing rows is unchanged

#### Scenario: Two analysts reorder at once

- GIVEN two analysts who read the same rows
- WHEN both reorder them at the same moment
- THEN one order is stored whole
- AND the other analyst is refused, told which rows moved
- AND no two rows share a position
