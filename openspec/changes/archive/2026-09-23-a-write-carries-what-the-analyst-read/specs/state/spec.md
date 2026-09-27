# State

## MODIFIED Requirements

### Requirement: A version is what a write is checked against, and it lives with the row

Anything an analyst may change MUST carry a version that moves when it changes. A write MUST state the version it was made against and MUST be refused where that no longer matches.

The check and the record of the change MUST succeed or fail together. A change that is stored while its record is not leaves every other screen believing something that is no longer true.

The version a write states MUST be the one the value it carries was read at. A record served again while a change is being made MUST NOT lend that change the newer version, because the check then passes on a write that should have been a question. One analyst's changes to one record MUST NOT be refused against each other: a screen that is correct only when its writes do not overlap is built for a single occupant on a fast link.

Where two analysts change the same field, the analyst whose change did not stand MUST be shown both values and MUST keep what they put there until they choose which stands. Leaving the field MUST NOT choose for them. A change to a field nobody else changed MUST NOT be treated as a collision, whatever else moved on the record.

A screen MUST show what the server holds, apart from a change the analyst is still making. A refused change MUST NOT be shown as made, and MUST appear only where the analyst is told it was refused.

#### Scenario: A write and its record are one act

- GIVEN a change to a case
- WHEN the change is stored
- THEN the record of it is stored in the same act
- AND no failure can leave one without the other

#### Scenario: A write arrives against a version that has moved

- GIVEN a row that has changed since a caller read it
- WHEN the caller writes against what it read
- THEN nothing is changed
- AND the caller is told what the row is on now

#### Scenario: A record is served again while an analyst is changing a field

- GIVEN an analyst part-way through changing a field
- WHEN another analyst changes the same field and the first analyst's screen is served the new record
- THEN the first analyst's change is not stored over the second's
- AND the first analyst is shown the second's value beside their own
- AND what they typed is still theirs

#### Scenario: A record is served again with a change to another field

- GIVEN an analyst part-way through changing a field
- WHEN another analyst changes a different field of the same record
- THEN the first analyst's change is stored
- AND no collision is raised

#### Scenario: A field the analyst only visited follows the server

- GIVEN an analyst with the cursor in a field they have not changed
- WHEN another analyst changes that field
- THEN the first analyst sees the new value
- AND leaving the field stores nothing

#### Scenario: Leaving a field in collision stores nothing

- GIVEN a field shown with both analysts' values
- WHEN the analyst leaves it without choosing
- THEN nothing is stored
- AND both values are still shown

#### Scenario: An analyst keeps their own value

- GIVEN a field shown with both analysts' values
- WHEN the analyst chooses their own
- THEN it is stored over the other's

#### Scenario: An analyst takes the other value

- GIVEN a field shown with both analysts' values
- WHEN the analyst chooses the other's
- THEN nothing is stored
- AND the field holds the other's value

#### Scenario: One analyst changes a record faster than it is answered

- GIVEN one analyst alone on a case making several changes to one record before the first is answered
- WHEN each is answered
- THEN every change is stored in the order made
- AND none is refused as somebody else's

#### Scenario: A refused change is not shown as made

- GIVEN a change the server refused
- WHEN the screen draws the record
- THEN it shows what the server holds
- AND the refused value appears only where the analyst is told it was refused

#### Scenario: A change made in a dialog is refused

- GIVEN an analyst editing an entry in a dialog
- WHEN another analyst changes the same field and the first analyst saves
- THEN the dialog stays open holding what the first analyst typed
- AND it names the field and the value the other analyst stored
- AND the first analyst can choose which stands without closing it
