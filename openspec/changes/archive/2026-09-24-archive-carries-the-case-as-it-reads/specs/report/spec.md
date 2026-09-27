# Report

## ADDED Requirements

### Requirement: A report is sent and preserved, or neither

A report MUST be both sent and preserved, or neither, whoever writes it: the send, an archive read in, or anything later. A report stamped as sent with nothing preserved, or preserving a document it was never sent with, MUST NOT be stored.

#### Scenario: Any writer states half a sent report

- GIVEN a report
- WHEN any writer stamps it sent without preserving its document, or preserves a document on a draft
- THEN the write is refused

### Requirement: What the install generates in a document leaving it carries no live indicator

In a document that leaves the install, every address the install generates from the case MUST be written so no reader's software turns it into a live link. A document preserved elsewhere and read in MUST be held to the same rule.

An analyst's own written prose is theirs, and what it says is not rewritten.

#### Scenario: A report leaves the install

- GIVEN a case whose records name a web address
- WHEN a report of it is produced
- THEN the address the install writes is not a live link

#### Scenario: A preserved document is read in with a live address

- GIVEN an archive preserving a sent report whose generated text holds a live address
- WHEN it is read in and the report produced
- THEN the address is not a live link
