# Live

## ADDED Requirements

### Requirement: Deleted prose is not kept

Text an analyst deletes from a report or a note MUST NOT be recoverable afterwards: not by a reader who arrives later, not by an archive, and not by any read of the record. A section removed from a report MUST take its prose with it.

A copy of the store taken before the deletion still holds what it held; that is the install's own copy, and returning to it is the state spec's act.

#### Scenario: A reader arrives after text was deleted

- GIVEN a report from which an analyst deleted text
- WHEN another reader opens it, or the record is read
- THEN the deleted text is not there

#### Scenario: A section is removed

- GIVEN a report section with prose in it
- WHEN the section is removed
- THEN its prose is gone from the report
