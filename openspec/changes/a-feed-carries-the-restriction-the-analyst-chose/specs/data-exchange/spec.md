# Data exchange

## MODIFIED Requirements

### Requirement: An indicator feed is what a defender can act on

An install MUST be able to publish a case's indicators in a form a defensive platform can consume, so that what an investigation found can be blocked without being retyped.

A feed intended for action MUST carry only indicators an analyst would act on. An indicator recorded as harmless MUST NOT appear in it. Where a disposition is not one the application recognises as harmless, the indicator MUST be treated as actionable, so that a new disposition fails towards being seen rather than towards being silently withheld.

A feed MUST carry the handling restriction under which it is shared, because an indicator feed leaves the install and the restriction is what tells the receiver what they may do with it.

The restriction a feed carries MUST mean to its receiver what it meant to the analyst who chose it. Where the vocabulary has versions that spell a level alike and define it differently, the feed MUST be marked under the version the application offers, and a level belonging to another version MUST say so where it is chosen. A restriction that reads the same to both ends and permits more to one of them is a disclosure the analyst did not make.

#### Scenario: An indicator is recorded as harmless

- GIVEN a case holding an indicator dispositioned as harmless
- WHEN a feed for action is published
- THEN that indicator is not in it

#### Scenario: A disposition the application does not recognise

- GIVEN an indicator carrying a disposition the application does not recognise as harmless
- WHEN a feed for action is published
- THEN the indicator is in it

#### Scenario: A feed is published for sharing

- GIVEN an analyst publishing an indicator feed
- WHEN they choose the handling restriction
- THEN the feed carries it
- AND a receiver can read what they may do with the feed

#### Scenario: A restriction is named for a form that cannot carry one

- GIVEN an analyst asking for a form that carries no handling restriction
- AND naming a restriction anyway
- WHEN the feed is requested
- THEN it is refused
- AND the refusal names the form that cannot carry it

#### Scenario: A level two versions of the vocabulary spell alike

- GIVEN a restriction whose name means one audience under an older version of the vocabulary and a narrower one under the version the application offers
- WHEN a feed is marked with it
- THEN the feed carries the version the application offers
- AND a receiver reading it is permitted no wider an audience than the analyst chose

#### Scenario: A level belonging to an older version

- GIVEN the vocabulary offers a level that belongs to an older version
- WHEN an analyst chooses a restriction
- THEN that level says which version it belongs to
