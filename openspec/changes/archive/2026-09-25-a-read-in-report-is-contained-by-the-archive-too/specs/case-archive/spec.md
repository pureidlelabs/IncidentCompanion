# Case archive

## MODIFIED Requirements

### Requirement: An archive's rows are checked against what this install can hold

An archive matching its own statement MUST NOT be read as though its rows were sound. A statement covers what the file carries; it says nothing about whether the rows inside are ones this install can mean.

Every row MUST be checked against the shape its collection declares, before any row is written, and against the rules its collection declares across fields, as its own door checks them.

A report an archive says was sent MUST also preserve its document, and one that preserves a document MUST say it was sent; the preserved document MUST be one this install can produce. The preserved document MUST be stored as it arrived, and every output of it MUST carry no live indicator, whatever the archive carried and whichever part the archive marks as an analyst's writing: nothing read in shows which prose an analyst wrote.

An archive's record MUST NOT carry a prose document: prose travels beside the record, and a record planting one is read as though it carried none. A value of a shape the field does not take MUST be refused rather than stored, and where a field's terms are fixed, a term outside them MUST be refused too.

What the check can refuse is what the collection states. A field whose terms are published as guidance rather than fixed in its shape is open at every door, and an archive is not the place to close it.

An archive carrying a row this install cannot hold MUST be refused whole, and MUST leave nothing of that archive behind. A case written in part is worse than no case: it looks sound, and the operator has no way to tell which rows were reached.

The refusal MUST name the collection it stopped at, in the words the application uses for it, rather than reporting how the store failed. An operator meeting the store's own words is told about columns they did not write and cannot act on.

A field this install does not know MUST be dropped rather than refused, so that an archive written by another build of this application still reads for what the two have in common.

#### Scenario: An archive states a term outside a fixed set

- GIVEN an archive whose statement is sound
- AND a row in it carrying a term outside the fixed set its field declares
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

#### Scenario: An archive leaves a column out

- GIVEN an archive that states nothing for a column this install has
- WHEN it is read
- THEN the column keeps the value the install would give it
- AND the row does not gain a value the archive never stated

#### Scenario: An archive states a value in a field its other fields make inapplicable

- GIVEN a row setting a field its collection's rules say does not apply to the row
- WHEN the archive is read
- THEN it is refused naming the collection

#### Scenario: An archive's report is sent without its document, or the reverse

- GIVEN an archive whose report says it was sent and preserves nothing, preserves a document and was never sent, or preserves one no painter reads
- WHEN it is read
- THEN it is refused naming the collection
- AND no case is left behind

#### Scenario: An archive carries a report it says was sent

- GIVEN a report sent and archived by an install
- WHEN the archive is read
- THEN the report reads as sent
- AND an address it preserved reaches no reader as a live link

#### Scenario: An archive's record plants a note document

- GIVEN an archive whose record carries a note's prose document
- WHEN it is read
- THEN the note opens as its own words, not as the planted document
