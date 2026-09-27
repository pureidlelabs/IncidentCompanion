# case-archive

## Purpose

What reading an archive owes where the case it carries meets a rule the receiving install already holds.

## ADDED Requirements

### Requirement: An archive is refused where its reference is already held

Reading an archive MUST be refused where the case reference it carries is already held by another case within the same customer, and the refusal MUST name the case holding it.

A reference identifies the customer's own record of the incident, so two cases carrying one reference leave no answer to which of them that record refers to. The refusal MUST leave the install unchanged, and MUST NOT depend on which door the archive arrived through.

An archive read into an install that does not hold the reference is unaffected, which is the handover between installs the format exists for.

#### Scenario: The install still holds the case the archive was made from

- GIVEN a case carrying a reference
- WHEN an archive of it is read into the same install
- THEN it is refused
- AND the analyst is told which case already holds that reference
- AND no case is created

#### Scenario: The reference is free

- GIVEN an install holding no case with the archive's reference
- WHEN the archive is read
- THEN the case is created carrying that reference

#### Scenario: The archive carries no reference

- GIVEN an archive of a case with no reference
- WHEN it is read into an install already holding cases with no reference
- THEN it is created, because the absence of a reference is not a value
