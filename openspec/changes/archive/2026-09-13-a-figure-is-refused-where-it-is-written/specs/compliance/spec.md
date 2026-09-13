# Compliance

## ADDED Requirements

### Requirement: A figure the case records is one it can read back

A figure an install stores MUST be one it can read back unchanged. Where a figure is held wider than the application can carry, it MUST be refused where it is written rather than accepted and found unreadable later.

The refusal MUST hold at the store itself, not only at the screens that write through it. A figure arriving by a route that does not validate — an archive restored into the install, a figure written directly — is the case this exists for, and a rule stated only above the store does not reach it.

#### Scenario: A figure larger than the install can carry

- GIVEN a figure past what the application can read back
- WHEN it is written
- THEN it is refused
- AND no row is stored holding it

#### Scenario: The largest figure the install can carry

- GIVEN a figure at that limit
- WHEN it is written
- THEN it is stored
- AND reading the case answers the figure that was written

#### Scenario: A figure arriving by a route that does not validate

- GIVEN an archive carrying a figure past what the application can read back
- WHEN it is brought into the install
- THEN the figure is not stored
