# Collections

## ADDED Requirements

### Requirement: A field derived from a row's prose has one writer

Where a field of a row is derived from prose written into that row, the prose MUST be its only writer once the row exists. The field MAY be given when the row is created, as the prose's first words. A later write naming it MUST be refused, saying which field and why.

A value answered as written MUST NOT be replaced afterwards by another writer. Two writers of one field, each unaware of the other, is the lost update the version check exists to prevent, arriving by a route the check cannot see.

A row's first words MUST be held once, however often the prose is opened and by whom.

#### Scenario: A derived field is written

- GIVEN a row whose field is derived from its prose
- WHEN a write names that field, alone or in bulk
- THEN it is refused, naming the field
- AND nothing an analyst typed into the prose is replaced

#### Scenario: A row's first words are opened again

- GIVEN a row created with its first words and opened by an analyst who wrote nothing
- WHEN the analyst's screen reconnects holding what it was sent
- THEN the row holds its first words once
