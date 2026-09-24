# Live

## MODIFIED Requirements

### Requirement: Written prose is attributed like any other write

A saved change to prose MUST name each analyst who wrote into it: on the record the prose belongs to, in the case's record of changes stored in the same act as the words, and in the install's audit. Every screen open on the case MUST learn the record changed.

Somebody who only had the prose open MUST NOT be named.

Prose is exempt from the version check and from nothing else a write owes. What is recorded is who wrote into a saved change, not which of its words each of them wrote.

**Words stored by any act are named, a send included.** Prose typed a moment before its report is sent MUST NOT reach the record under the sender's name alone.

#### Scenario: One of two analysts present writes

- GIVEN two analysts with the same prose open
- WHEN only one of them writes and the prose is saved
- THEN the record, the case's record of changes and the install's audit name the one who wrote
- AND none of them names the one who only read

#### Scenario: Two analysts write before one save

- GIVEN two analysts writing into the same prose
- WHEN both write before it is saved
- THEN the case's record of changes and the install's audit name both of them

#### Scenario: Words typed just before the report is sent

- GIVEN an analyst writing into a report
- WHEN the report is sent before their words are saved
- THEN the sent report holds their words
- AND the case's record of changes and the install's audit name them
