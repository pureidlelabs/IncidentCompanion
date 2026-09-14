# Case archive

## ADDED Requirements

### Requirement: An archive's rows are checked against what this install can hold

An archive matching its own statement MUST NOT be read as though its rows were sound. A statement covers what the file carries; it says nothing about whether the rows inside are ones this install can mean.

Every row MUST be checked against the shape its collection declares, before any row is written. A value the collection cannot mean — a term no vocabulary defines, a value of a shape the field does not take — MUST be refused rather than stored.

An archive carrying a row this install cannot hold MUST be refused whole, and MUST leave nothing of that archive behind. A case written in part is worse than no case: it looks sound, and the operator has no way to tell which rows were reached.

The refusal MUST name the collection it stopped at, in the words the application uses for it, rather than reporting how the store failed. An operator meeting the store's own words is told about columns they did not write and cannot act on.

A field this install does not know MUST be dropped rather than refused, so that an archive written by another build of this application still reads for what the two have in common.

#### Scenario: An archive states a term no vocabulary defines

- GIVEN an archive whose statement is sound
- AND a row in it carrying a term the collection's vocabulary does not define
- WHEN it is read
- THEN it is refused
- AND the term is not stored

#### Scenario: An archive states a value of the wrong shape

- GIVEN a row naming a thing with a value of a shape that field does not take
- WHEN the archive is read
- THEN it is refused
- AND nothing is stored in that field's place

#### Scenario: An archive states a value the store cannot hold

- GIVEN a row carrying a value no column can hold
- WHEN the archive is read
- THEN it is refused naming the collection
- AND the operator is not shown how the store failed

#### Scenario: An archive is refused after some of its rows were sound

- GIVEN an archive whose first rows are sound and whose later ones are not
- WHEN it is read
- THEN it is refused
- AND no case is left behind

#### Scenario: An archive carries a field this install does not know

- GIVEN an archive written by another build of this application
- AND a row in it carrying a field this install has no place for
- WHEN it is read
- THEN the field is dropped
- AND the rest of the row is read
