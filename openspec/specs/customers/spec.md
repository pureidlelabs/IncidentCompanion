# Customers

## Purpose

A customer is the organisation an incident happened to. Cases belong to one, who reaches a case is decided by one, and the facts about an organisation that do not change with each incident are held here rather than retyped into every case.

This spec covers what a customer is, what it holds, and how a case takes values from it. Who may create a customer, and how an analyst comes to reach one, belongs to the accounts and access spec.

## Requirements

### Requirement: A customer is a record the system holds

A customer MUST be a thing the system holds in its own right, identified independently of its name, so that renaming an organisation does not break what refers to it.

An install MUST always hold a default customer, standing for an incident whose origin is not yet known. The default customer MUST NOT be deletable and MUST NOT be editable into an ordinary one.

#### Scenario: A customer is renamed

- GIVEN a customer with cases against it
- WHEN the organisation's name changes
- THEN every case still belongs to the same customer
- AND nothing that referred to it is broken

#### Scenario: An install has no customers

- GIVEN a newly installed system with no customers onboarded
- WHEN an analyst opens a case
- THEN it is created against the default customer
- AND the install is usable before anybody is onboarded

### Requirement: A customer holds what compliance asks about the organisation

A customer MUST hold the facts a regulatory assessment asks about the organisation rather than about the incident, so that an analyst answers them once rather than at every case.

The organisation's facts are: which regulatory regimes apply to it at all, its home member state, whether it operates beyond the EU and where, its competent authority, its data protection officer's contact, the size of its user base, its annual turnover, its critical functions, and the services it provides that are supervised.

The incident's facts MUST NOT be held here. Whether personal data was involved, how many users this incident affected, how long service was down, what it cost, whether access was malicious, and every date on which somebody was notified belong to the case.

#### Scenario: A regime does not apply to a customer

- GIVEN a customer to which a regulatory regime does not apply
- WHEN a case is assessed for compliance
- THEN that regime's questions are not asked
- AND the case is not reported as incomplete for leaving them unanswered

#### Scenario: An organisation fact is asked for at case level

- GIVEN a compliance question about the organisation rather than the incident
- WHEN an analyst fills it on a case
- THEN it was already answered from the customer

### Requirement: A case takes a copy, and is told when the original moves

A case MUST take its own copy of the organisation's facts rather than reading the customer's live. A report written months ago MUST say what was true when it was written, and correcting a customer's record MUST NOT silently rewrite what was already sent.

A case MUST show when a value it copied no longer matches the customer, so an analyst can decide whether to take the new one. The system MUST NOT decide that for them.

#### Scenario: A customer's details are corrected

- GIVEN cases against a customer, carrying copied values
- WHEN the customer's record is corrected
- THEN no case changes on its own
- AND every case carrying a value that has moved shows that it has

#### Scenario: An analyst accepts a correction

- GIVEN a case showing that a copied value has moved
- WHEN the analyst takes the new value
- THEN the case carries it
- AND the change is attributed like any other

#### Scenario: A closed case is left alone

- GIVEN a closed case carrying values copied before a correction
- WHEN the customer's record is corrected
- THEN the closed case is unchanged
- AND what it reported remains what it reported

### Requirement: A case may answer for an organisation the system does not hold

An incident sometimes concerns an organisation nobody has onboarded, and the investigation MUST NOT wait for that. An analyst MUST be able to answer an organisation's compliance facts on the case itself, once, without a customer record existing.

Where a case answers them itself, those answers MUST be recognisable as the case's own rather than copied, so that onboarding the organisation later does not silently overwrite them.

#### Scenario: An organisation is answered for on the case

- GIVEN a case against the default customer
- WHEN the analyst answers the organisation's compliance facts on the case
- THEN the case carries them
- AND they are marked as the case's own

#### Scenario: The organisation is onboarded afterwards

- GIVEN a case carrying its own answers for an organisation
- WHEN that organisation is onboarded as a customer and the case moves to it
- THEN the case's own answers are kept
- AND where the customer's differ, the case shows both and the analyst chooses

### Requirement: A customer cannot be removed out from under its cases

Removing a customer MUST NOT leave a case belonging to nothing, and MUST NOT be a way to make cases unreachable without a record.

Where two records turn out to be one organisation they MUST be mergeable, since duplicates are how customer records actually go wrong and moving cases one at a time invites the analyst to miss some. A merge MUST move everything the losing customer held, and MUST NOT change what any case had already copied.

#### Scenario: A customer with cases is removed

- GIVEN a customer with cases against it
- WHEN somebody attempts to remove it
- THEN it is refused
- AND they are told how many cases stand in the way

#### Scenario: Two customer records turn out to be one organisation

- GIVEN two customers that are the same organisation
- WHEN they are merged
- THEN every case moves to the surviving customer
- AND each case keeps the values it had already copied
- AND the merge is attributed

#### Scenario: The merged records disagree

- GIVEN two customers being merged
- AND a fact each answers differently
- WHEN the merge is made
- THEN the analyst chooses which answer survives
- AND the system does not choose for them

#### Scenario: Reach after a merge

- GIVEN an analyst reaching one of two customers being merged
- WHEN the merge is made
- THEN they reach the survivor
- AND they reach the cases that came from the customer they did not hold

#### Scenario: An analyst reaches both sides of a merge at different levels

- GIVEN an analyst reaching one customer at read and the other at read and write
- WHEN the two are merged
- THEN they reach the survivor at read and write
- AND the merge grants nothing neither side already gave them

#### Scenario: A reference collides across the merge

- GIVEN two customers each holding a case with the same external reference
- WHEN they are merged
- THEN the merge is refused until one is changed
- AND the analyst is told which two cases collide

#### Scenario: The default customer is merged

- GIVEN the default customer
- WHEN somebody attempts to merge it into another, or another into it
- THEN it is refused
