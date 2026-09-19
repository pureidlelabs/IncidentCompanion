# Incident import

## ADDED Requirements

### Requirement: An incident is not used up by the case it starts

An analyst MUST be able to start a case from an incident that has already started one. An incident describes something that happened, and what it produced in this application is not a property of it.

What the application composes for the new case MUST NOT include a value it requires to be unique. A value taken from the incident repeats every time that incident is read again, so composing one from it refuses the second case by construction — at the moment the case is written, after the analyst has reviewed what it would hold.

#### Scenario: A second case from the same incident

- GIVEN an incident a case has already been started from
- WHEN an analyst starts another case from it
- THEN the case is created

#### Scenario: A composed field would have to be unique

- GIVEN a field the application requires to be unique across cases
- WHEN a case is started from an incident
- THEN the application does not compose that field from the incident
