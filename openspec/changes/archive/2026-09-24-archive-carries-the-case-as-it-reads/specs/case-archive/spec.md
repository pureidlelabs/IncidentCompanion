# Case archive

## MODIFIED Requirements

### Requirement: An archive is one file holding the whole case

An archive MUST be a single file, and MUST hold everything needed to read the case again: the record, the prose as it reads, and the material attached as evidence.

What an archive carries MUST be the case as it reads when it is made. Text an analyst deleted, a section removed from a report, and prose under a section that is no longer written MUST NOT travel. A note's prose travels as a report's does.

The number of rows an archive describes MUST NOT exceed what the install reads back, so a case past it is refused rather than archived, with the refusal naming the limit.

An analyst MUST be able to leave the attached material out, because evidence is what makes an archive large and moving the record alone is often what is wanted.

Where material is left out, or is expected and not found, the archive MUST say so. An archive that is quietly missing evidence is one somebody discovers is incomplete only when they need it.

#### Scenario: A case is archived

- GIVEN a case with prose and attached evidence
- WHEN it is archived
- THEN the archive holds the record, the prose, and the evidence

#### Scenario: An analyst archives without the attachments

- GIVEN a case with attached evidence
- WHEN the analyst archives it without the attachments
- THEN the archive says the attachments were left out

#### Scenario: Expected material is not found

- GIVEN a case whose stored evidence cannot all be found
- WHEN it is archived
- THEN the archive says how much was not found

#### Scenario: Deleted text does not travel

- GIVEN a report from which an analyst deleted text
- WHEN the case is archived
- THEN the archive does not carry the deleted text
- AND it carries the text that remains

#### Scenario: A removed section does not travel

- GIVEN a report with a section the analyst removed, and one no longer written
- WHEN the case is archived
- THEN the archive carries neither section's prose

#### Scenario: A note's prose is archived

- GIVEN a note written with formatting
- WHEN the case is archived and read back in
- THEN the note reads as it was written

#### Scenario: A case larger than an archive may carry

- GIVEN a case holding more rows than the install reads from one archive
- WHEN it is archived
- THEN the archive is refused, naming the limit


### Requirement: An archive says what it should contain, and is checked against it

An archive MUST carry a statement of what it holds, and reading one MUST check what is there against that statement before any of it is used.

An archive whose content does not match its own statement MUST be refused. A file damaged in transit MUST NOT be read into a case as though it were sound. A sealed archive altered by anybody not holding its secret MUST be refused.

Whoever holds a plain archive can rewrite it and its statement together, so sealing is what protects an archive against alteration, and the people it is handed to MUST be told so.

#### Scenario: An archive is read

- GIVEN an archive
- WHEN it is read
- THEN each thing in it is checked against what the archive says it should be

#### Scenario: An archive has been altered

- GIVEN an archive whose content no longer matches its own statement
- WHEN it is read
- THEN it is refused

#### Scenario: A sealed archive is altered by somebody without its secret

- GIVEN a sealed archive altered by somebody not holding its secret
- WHEN it is read with the secret
- THEN it is refused

#### Scenario: An analyst archives without sealing

- GIVEN an analyst archiving a case without a secret
- WHEN they choose not to seal it
- THEN they are told that whoever holds the archive can change it without that showing

### Requirement: Reading an archive cannot be made to cost more than the install will spend

An archive is a file from outside the install, and the work of opening one is described by the file itself. An archive MUST NOT be able to describe work the install will perform.

Where an archive declares that opening it costs more than this install would ever produce, it MUST be refused before that work begins rather than after.

The size of what an archive claims to hold MUST be bounded before it is read, so that a small file cannot describe an unbounded amount of content. The number of rows it describes MUST be bounded too, and counted before any row is written.

#### Scenario: An archive declares more work than the install produces

- GIVEN an archive declaring a cost to open higher than this install ever writes
- WHEN it is read
- THEN it is refused before the work is done

#### Scenario: An archive describing more content than the install accepts

- GIVEN an archive claiming to hold more than the install accepts
- WHEN it is read
- THEN it is refused

#### Scenario: An archive describing more rows than the install writes

- GIVEN an archive describing more rows than the install reads from one archive
- WHEN it is read
- THEN it is refused before any row is written
- AND the refusal names the limit


### Requirement: An archive's rows are checked against what this install can hold

An archive matching its own statement MUST NOT be read as though its rows were sound. A statement covers what the file carries; it says nothing about whether the rows inside are ones this install can mean.

Every row MUST be checked against the shape its collection declares, before any row is written, and against the rules its collection declares across fields, as its own door checks them.

A report an archive says was sent MUST also preserve its document, and one that preserves a document MUST say it was sent; the preserved document MUST be one this install can produce. What the install generates in it MUST NOT be a live indicator, whatever the archive carried; what an analyst wrote in it is theirs, as it is in a report sent here.

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
