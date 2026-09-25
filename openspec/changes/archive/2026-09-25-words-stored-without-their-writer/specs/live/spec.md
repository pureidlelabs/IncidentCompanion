# Live

## MODIFIED Requirements

### Requirement: Written prose is edited together, not saved over

Prose an analyst writes into a report MUST be editable by two analysts at once without either losing work, and without one having to wait for the other.

This is the one place where the last write does not win and a version check is the wrong instrument: two people typing in one paragraph are not making conflicting claims about a fact, they are writing a sentence together.

Where an analyst is disconnected while writing, their work MUST survive and MUST merge when they return.

Words whose every writer's account is gone before they are stored MUST still be stored, naming nobody as their writer. Words whose writer still has an account MUST NOT be stored for them once they can no longer write, unless an analyst who can write the record stores them.

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

#### Scenario: Every writer's account is gone before the words are stored

- GIVEN an analyst writing alone in a passage
- WHEN their account is deleted before what they typed is stored
- THEN the words are stored
- AND the record and the case's record of changes name nobody as their writer

#### Scenario: The only writer loses write before the words are stored

- GIVEN an analyst writing alone in a passage, whose account remains
- WHEN they lose write before what they typed is stored
- THEN the words are not stored
