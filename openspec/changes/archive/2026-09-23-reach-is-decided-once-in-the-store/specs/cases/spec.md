# Cases

## MODIFIED Requirements

### Requirement: A case is identified by what an analyst recognises it by

A case MUST carry a title. It MUST belong to exactly one customer, and that customer is a reference to one the system holds, never text typed on the case.

A case always has a customer, and where the analyst does not yet know whose incident it is, that customer is the install's default. An incident is frequently opened before anyone knows whose it is, and refusing the case until that is settled loses the first hour of the investigation.

The default customer is a customer like any other, so no case is ever reached through a path that skips the access check. Every analyst reaches it, and at a level that lets them work: an incident whose origin is unknown belongs to whoever can act on it, and withholding it would let an analyst open a case they cannot then work.

A case MUST be able to move from the default customer to a real one without being recreated. Once it moves, reach is the new customer's alone, and analysts who could reach it only through the default customer lose it.

A case MAY carry the reference the analyst knows it by outside this system, since an incident under investigation is usually also a ticket somewhere else — but not always yet, so a case MUST be openable without one.

Where a case carries a reference it MUST be unique within its customer. The absence of a reference is not a value and never collides: any number of cases for one customer may be waiting for theirs.

A case MUST be addressable by an identifier that is stable, unguessable, and not derived from any of the above.

#### Scenario: A reference is reused within a customer

- GIVEN a case for a customer, carrying a reference
- WHEN a second case is created for that customer with the same reference
- THEN it is refused
- AND the analyst is told which case already holds it

#### Scenario: The same reference is used for two customers

- GIVEN a case for one customer, carrying a reference
- WHEN a case for a different customer is created with the same reference
- THEN both exist

#### Scenario: A case moves to a customer that already uses its reference

- GIVEN a case carrying a reference
- WHEN it is moved to a customer that already has a case with that reference
- THEN the move is refused

#### Scenario: The mover reaches the customer that already uses the reference

- GIVEN a case carrying a reference
- AND an analyst who reaches a customer already holding a case with that reference
- WHEN they move the case to that customer
- THEN the move is refused
- AND they are told which case holds the reference

#### Scenario: A case carrying a reference is moved to a customer the mover does not reach

- GIVEN a case carrying a reference
- AND an analyst who does not reach a customer
- WHEN they move the case to that customer
- THEN the move is refused
- AND the refusal is the same whether or not that customer uses the reference
- AND the case stays with the customer it had

#### Scenario: Several cases for one customer have no reference

- GIVEN a case for a customer, carrying no reference
- WHEN further cases are created for that customer, also carrying none
- THEN all are created
- AND none is treated as colliding with another

#### Scenario: A case gains its reference later

- GIVEN a case carrying no reference
- WHEN the analyst supplies one that no other case for that customer holds
- THEN it is accepted
- AND the change is attributed

### Requirement: Reaching a case is decided in one place, by customer

Whether a caller may reach a case MUST be decided in a single place, ahead of anything that serves the case's contents.

An analyst MUST reach a case only where they reach that case's customer, and MUST do to it only what their level over that customer permits. Reach is held against a customer the system knows as a thing in its own right, never against text somebody typed on a case. How reach and level are granted is the accounts and access spec's.

#### Scenario: An analyst reaches a case for a customer they hold

- GIVEN an analyst who reaches a customer
- WHEN they request a case for that customer, or anything hanging off it
- THEN the request is served
- AND what they may do to it is what their level permits

#### Scenario: An analyst reaches a case for a customer they do not hold

- GIVEN an authenticated analyst
- AND a case belonging to a customer they do not reach
- WHEN they request it, or anything hanging off it
- THEN the request is refused
- AND the refusal is identical whether the case does not exist or is merely out of reach

#### Scenario: An unknown customer becomes known

- GIVEN a case against the default customer
- WHEN the customer is identified, whether by onboarding them or by naming them on the case
- THEN the case gains that customer
- AND reach follows the new customer from that moment
- AND the change is attributed

#### Scenario: A case's customer changes under an analyst

- GIVEN a case belonging to one customer, which may be the default
- AND an analyst who reaches that customer and not the next
- WHEN the case is moved to another customer
- THEN the analyst can no longer reach it
- AND anything they had open on it stops being served
- AND the move is an attributed change

#### Scenario: A case is opened before the customer is known

- GIVEN an analyst opening a case for an incident of unknown origin
- WHEN they supply a title and no customer
- THEN the case is created against the install's default customer
- AND every analyst may reach it

#### Scenario: A case is reached over a live connection

- GIVEN an analyst at some level over a case's customer, or at none
- WHEN they open the case over a live connection and act on it
- THEN they may see and change what a request of the same kind would let them
