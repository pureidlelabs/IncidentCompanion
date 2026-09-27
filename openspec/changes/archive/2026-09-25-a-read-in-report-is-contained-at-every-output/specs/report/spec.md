# Report

## MODIFIED Requirements

### Requirement: What the install generates in a document leaving it carries no live indicator

In a document that leaves the install, every address the install generates from the case MUST be written so no reader's software turns it into a live link.

A document preserved elsewhere and read in MUST be stored as it arrived, and MUST be held to the same rule at every output, its written prose included: nothing read in shows which prose an analyst wrote.

In a report sent from this install, an analyst's own written prose is theirs, and what it says is not rewritten.

#### Scenario: A report leaves the install

- GIVEN a case whose records name a web address
- WHEN a report of it is produced
- THEN the address the install writes is not a live link

#### Scenario: A preserved document is read in with a live address

- GIVEN an archive preserving a sent report whose text holds a live address
- WHEN it is read in and the report produced
- THEN the address is not a live link
- AND the preserved document is stored as it arrived
