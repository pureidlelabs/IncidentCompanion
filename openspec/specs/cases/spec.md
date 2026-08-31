# Cases

## Purpose

A case is the unit of work and the unit of access. It is one incident under investigation: everything an analyst records, every piece of evidence, every entity and the report written from them hang off exactly one case, and nothing crosses between two.

This spec covers a case's identity, its lifecycle, who may reach it, and what survives its destruction. What a case *holds* is specified by the collections, evidence, report and compliance specs; this one governs the container.

## Requirements

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

### Requirement: A case says where its work sits

A case MUST carry a state, and the question that state answers is where the work is: whether the SOC is still actively handling the incident, or whether the incident is over and what remains is the write-up, the reporting and the lessons. An analyst scanning a list of cases MUST be able to tell those apart without opening any of them.

The states take their names from the incident response functions of the NIST Cybersecurity Framework 2.0, as NIST SP 800-61r3 applies them, plus the closing state this product adds:

- **Respond** — the SOC is containing and eradicating. The incident is live.
- **Recover** — service and data are being restored. The incident is live.
- **Post-incident** — the incident is over. What remains is reporting and lessons learned.
- **Closed** — nothing is outstanding.

The state is a marker, not a gate. A case MUST NOT be required to pass through every state, and MUST be able to return to an earlier one: an incident believed handled that resumes is ordinary, not an exception.

Closing is the one exception, and it is gated on what the case owes rather than on where it has been. A case MUST NOT be closable while reporting or lessons it owes are outstanding, from any state.

Moving between states MUST be an attributed change like any other. A state MUST NOT be inferred from the presence or absence of other data.

#### Scenario: An analyst scans the case list

- GIVEN cases in several states
- WHEN an analyst lists them
- THEN which are live incidents and which are in write-up is apparent without opening any

#### Scenario: The incident ends before the case does

- GIVEN a case whose incident is contained and recovered
- WHEN the analyst records that the incident is over
- THEN the case moves to post-incident
- AND it is no longer counted as a live incident
- AND it is not closed

#### Scenario: A case is closed with reporting outstanding

- GIVEN a case with reporting or lessons learned still owed
- WHEN an analyst attempts to close it
- THEN it is refused
- AND the analyst is told what is outstanding

#### Scenario: A case owes nothing

- GIVEN a case with nothing outstanding
- WHEN an analyst closes it
- THEN the case records that it concluded and when
- AND it remains readable
- AND it did not have to pass through post-incident to get there

#### Scenario: A handled incident resumes

- GIVEN a case in Recover or post-incident
- WHEN activity shows the incident is not over
- THEN the case can return to Respond
- AND the return is attributed like any other move

> [SETTLED: regulatory reporting stage is not a case state and not a second axis on the case. Whether a DORA initial, intermediate or final report is owed and sent is the compliance spec's, tracked against the case rather than as its condition.]

### Requirement: A case's destruction is itself a record

Deleting a case MUST NOT be a way to make an investigation disappear without trace.

The record of a deletion MUST survive the case: it MUST NOT live anywhere that the deletion removes. It MUST name who deleted the case, when, and enough about the case to recognise which one it was.

Demonstration content is the one exception. It records no investigation, so its removal leaves nothing, including no deletion record.

#### Scenario: An analyst deletes a case

- GIVEN a case with evidence, entities and a change history
- WHEN an analyst deletes it
- THEN the case and everything hanging off it is gone
- AND a record of the deletion remains, naming the analyst, the moment, and the case's identity
- AND that record is readable after the case is gone

#### Scenario: The install is asked what happened to a case

- GIVEN a case that was deleted
- WHEN somebody asks the install about that identifier
- THEN it can answer that the case existed and was deleted, by whom and when
- AND it does not disclose what the case contained

#### Scenario: A demonstration case is removed

- GIVEN a case created as demonstration content
- WHEN it is removed
- THEN it leaves nothing behind, including no deletion record

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

### Requirement: Demonstration content is distinguishable from real work

Content that exists to demonstrate the product MUST be distinguishable from an analyst's own work, both to a person and to the system.

Anything answering a question about real investigations MUST NOT silently include demonstration content.

#### Scenario: An install carries both

- GIVEN an install holding demonstration cases and real cases
- WHEN an analyst lists cases
- THEN which are demonstrations is apparent without opening them

#### Scenario: A count is taken across cases

- GIVEN an install holding demonstration cases and real cases
- WHEN anything counts, reports on, or exports across cases
- THEN demonstration content is excluded unless it was asked for

### Requirement: An analyst can return to recent work

An analyst MUST be able to return to what they were working on without searching for it.

#### Scenario: An analyst returns after closing the application

- GIVEN an analyst who has been working in several cases
- WHEN they open the application again
- THEN the cases they last worked in are offered to them
- AND the ordering reflects their own activity, not another analyst's

#### Scenario: Recent work names a case that has gone

- GIVEN an analyst whose recent work includes a case since deleted
- WHEN they open the application
- THEN the missing case is not offered
- AND nothing about it is disclosed
