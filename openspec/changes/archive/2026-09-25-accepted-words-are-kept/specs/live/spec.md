# Live

## MODIFIED Requirements

### Requirement: Written prose is edited together, not saved over

Prose an analyst writes into a report MUST be editable by two analysts at once without either losing work, and without one having to wait for the other.

This is the one place where the last write does not win and a version check is the wrong instrument: two people typing in one paragraph are not making conflicting claims about a fact, they are writing a sentence together.

Where an analyst is disconnected while writing, their work MUST survive and MUST merge when they return.

Words the application accepted from an analyst who could write at that moment MUST be stored and named for them, whether or not they can still write when the words are stored. A word arriving after they can no longer write MUST be refused and never stored. Words MUST be stored only into the record, and the case, they were accepted into.

#### Scenario: Two analysts write in one section

- GIVEN two analysts editing the same passage
- WHEN both type
- THEN both sets of words survive
- AND neither is asked to resolve a conflict

#### Scenario: An analyst writes while disconnected

- GIVEN an analyst who loses their connection mid-sentence
- WHEN they reconnect
- THEN what they wrote is present
- AND merged with whatever arrived while they were away

#### Scenario: One of the writers loses write before the words are stored

- GIVEN two analysts writing in one passage
- WHEN one of them loses write before what both typed is stored
- THEN both sets of words are stored

#### Scenario: The only writer loses write before the words are stored

- GIVEN an analyst writing alone in a passage
- WHEN they lose write before what they typed is stored
- THEN the words are stored
- AND the record, the case's record of changes and the install's audit name them

#### Scenario: A writer is disabled before the words are stored

- GIVEN an analyst writing in a passage
- WHEN their account is disabled before what they typed is stored
- THEN the words are stored
- AND the record, the case's record of changes and the install's audit name them

#### Scenario: A word arrives after write is withdrawn

- GIVEN an analyst whose write was withdrawn while the passage was open
- WHEN they send more words
- THEN those words are refused
- AND they are never stored

#### Scenario: Words are addressed to a record in another case

- GIVEN an analyst connected to one case
- WHEN they send words addressed to a record of another case
- THEN nothing is stored in that record
