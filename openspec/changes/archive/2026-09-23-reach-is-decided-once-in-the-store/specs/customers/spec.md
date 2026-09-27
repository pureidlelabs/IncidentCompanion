# Customers

## MODIFIED Requirements

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
- AND nothing either case holds is shown beyond its identifier and the reference

#### Scenario: The default customer is merged

- GIVEN the default customer
- WHEN somebody attempts to merge it into another, or another into it
- THEN it is refused
