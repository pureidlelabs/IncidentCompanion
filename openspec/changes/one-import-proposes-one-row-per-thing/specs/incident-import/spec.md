# Incident import

## ADDED Requirements

### Requirement: One import proposes each thing once, however many incidents name it

An import of several incidents MUST propose each thing once, whatever number of those incidents name it, and MUST do so in the preview rather than at the moment of writing. An analyst MUST NOT be asked to approve two rows that become one.

A thing proposed twice MUST be recognised by the same rules that recognise one the case already holds. Where those rules let a thing be known by less than it was named with, a naming carrying the qualifier and one without it MUST be recognised as the same thing, in either order.

The surviving row MUST carry what each naming supplied. A qualifier one incident stated and another omitted MUST reach the written row, so that collapsing two proposals into one loses nothing an analyst was going to be shown.

The surviving row MUST be attributed to the first incident that proposed it, and an event from any other incident that named it MUST link to that row.

This governs collections that have an identity. Rows that are events rather than things are not matched against each other, here or against the case.

#### Scenario: Two incidents name the same host

- GIVEN an import of two incidents whose entities both name one host
- WHEN the analyst reviews it
- THEN the host is proposed once
- AND accepting the import writes one host

#### Scenario: One incident states a qualifier the other omits

- GIVEN an import where one incident names a thing with a qualifier its identity may be known without
- AND another incident names that thing without the qualifier
- WHEN the analyst reviews it
- THEN it is proposed once
- AND the proposed row carries the qualifier, whichever incident came first

#### Scenario: An event from the second incident names the shared thing

- GIVEN an import of two incidents that both name one host
- WHEN the import is accepted
- THEN the events from both incidents point at the same host row
