# Live

## MODIFIED Requirements

### Requirement: A change reaches every open screen, and says only what changed

A write anywhere MUST reach every screen open on that case, so that an analyst reading a case sees what another has just done without asking for it.

What is delivered MUST be enough to know what to re-read and no more. The change itself MUST NOT travel: a screen learns that something in a part of the case moved, and asks for it through the interface that decides whether it may have it.

This is what keeps one boundary rather than two. A connection that carried case content would be a second place where reach is decided, and it is the place with no guards.

An announcement MUST name who wrote as the case's record of changes names them, whether or not they are on the case, and MUST name nobody where their account is gone.

#### Scenario: Another analyst writes

- GIVEN two analysts with the same case open
- WHEN one changes something
- THEN the other's screen shows it without being reloaded

#### Scenario: What travels over the connection

- GIVEN a change to a case
- WHEN it is announced
- THEN the announcement names what moved
- AND does not carry the content that moved

#### Scenario: A screen re-reads after an announcement

- GIVEN a screen told that something changed
- WHEN it asks for the new state
- THEN that request is subject to every check any other request is

#### Scenario: Another analyst writes from outside the case

- GIVEN an analyst with a case open
- WHEN another analyst who does not have it open writes to it
- THEN the announcement names the writer by their name

#### Scenario: A writer whose account is gone

- GIVEN an analyst with a case open
- WHEN a write is saved whose writer's account is gone
- THEN the announcement names nobody

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
