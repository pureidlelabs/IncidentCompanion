# Incident import

## ADDED Requirements

### Requirement: An analyst can start a case from an incident

Where an analyst chooses how a case starts, starting it from an incident the provider holds MUST be one of the choices.

An incident is where most cases begin, and a route to the one-act import that no screen offers is a route nobody takes. A requirement stated as a condition is met by an implementation nothing calls, so the door is stated as behaviour the analyst is owed rather than as a capability the write path has.

What the case is called MUST be asked while nothing has been written. The analyst names a case for what it turns out to be about, and they learn that from the incidents; asked before the wizard runs, the name is a guess made from an identifier.

The case MUST NOT exist until the analyst accepts the review. Leaving the wizard at any point before that MUST leave no case behind.

Once the case exists, the analyst MUST land on it.

#### Scenario: An analyst starts a case from an incident

- GIVEN an analyst choosing how a case starts
- WHEN they choose to start from an incident, walk the wizard and accept the review
- THEN the case exists, holds what was approved, and is the case they are looking at

#### Scenario: The analyst names the case at the review

- GIVEN an analyst who has reached the review of a case that does not exist yet
- WHEN they are asked what the case is called
- THEN they have seen the incidents it will hold, and nothing has been written

#### Scenario: An analyst leaves the wizard

- GIVEN an analyst part way through starting a case from an incident
- WHEN they leave without accepting the review
- THEN no case was created

#### Scenario: A case is named by what an analyst had to give it

- GIVEN a case whose optional reference was never filled in
- WHEN the analyst looks at the case
- THEN it is named by its title rather than by an identifier
