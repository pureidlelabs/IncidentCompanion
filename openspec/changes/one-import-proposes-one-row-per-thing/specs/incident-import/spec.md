# Incident import

## ADDED Requirements

### Requirement: One import proposes each thing once, however many incidents name it

An import of several incidents MUST propose each thing once, whatever number of those incidents name it, and MUST do so in the preview rather than at the moment of writing. An analyst MUST NOT be asked to approve two rows that become one.

A thing proposed twice MUST be recognised by the same rules that recognise one the case already holds, including where one incident names it more precisely than another.

The surviving row MUST be attributed to the first incident that proposed it, and an event from any other incident that named it MUST link to that row.

This governs collections that have an identity. Rows that are events rather than things are not matched against each other, here or against the case.

#### Scenario: Two incidents name the same host

- GIVEN an import of two incidents whose entities both name one host
- WHEN the analyst reviews it
- THEN the host is proposed once
- AND accepting the import writes one host

#### Scenario: One incident names a thing more precisely than another

- GIVEN an import where one incident names a thing with a qualifier and another names it without
- WHEN the analyst reviews it
- THEN it is proposed once

#### Scenario: An event from the second incident names the shared thing

- GIVEN an import of two incidents that both name one host
- WHEN the import is accepted
- THEN the events from both incidents point at the same host row
