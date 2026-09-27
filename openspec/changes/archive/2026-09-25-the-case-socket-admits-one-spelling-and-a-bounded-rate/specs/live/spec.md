# Live

## ADDED Requirements

### Requirement: A case is one case however it is named

An identifier MUST name one case, one record and one report whatever letter case it is written in. A connection or a request naming a case in another spelling MUST be in the same room as everybody else on it: on the same roster, writing into the same document, and stored into the same record.

#### Scenario: An analyst names the case in another spelling

- GIVEN an analyst connected to a case
- WHEN another connects naming the same case in capitals
- THEN each is on the roster the other sees
- AND the case is not deleted while they are in it

#### Scenario: Words written through another spelling

- GIVEN two analysts writing into one passage, each naming the case differently
- WHEN both type
- THEN each sees the other's words
- AND what they wrote is stored and named for its writer

#### Scenario: A report is sent by another spelling of its identifier

- GIVEN words typed into a report just before it is sent
- WHEN the send names the report in capitals
- THEN the sent report holds the words

### Requirement: A caret names the analyst the install admitted

A caret shown to the others on a case MUST carry the name of the analyst whose connection sent it, whatever name the sender supplied. A connection MUST NOT move, rename or remove a caret another analyst's connection announced.

#### Scenario: A caret carries another analyst's name

- GIVEN two analysts with the same prose open
- WHEN one sends a caret carrying the other's name
- THEN the others see it under the sender's own name

#### Scenario: A connection sends for a caret another analyst holds

- GIVEN a caret one analyst's connection announced
- WHEN another analyst's connection sends an update for that caret
- THEN the caret is unchanged for everyone
- AND nothing of the update reaches anybody

### Requirement: A connection is held to a rate

An analyst MUST NOT hold more connections at once, or open them faster, than a stated bound. An address MUST NOT have more upgrades refused before anybody is known than a stated bound. A connection MUST NOT send more frames or more bytes than a stated budget, and one that does MUST be ended with a code that says why.

Every bound MUST sit above what the application's own screens do, however hard they are used, so that an analyst never meets one.

A refusal past a bound MUST be recorded, and a run of them MUST be recorded once rather than once per attempt, so that a flood does not decide how much of the audit the install spends.

#### Scenario: One analyst opens many connections at once

- GIVEN a signed-in analyst
- WHEN they open far more connections at once than a browser holds
- THEN only a bounded number is admitted and the rest are refused as too many
- AND the refusals are recorded as a run rather than one line each

#### Scenario: Many connections nobody signed

- GIVEN one address
- WHEN it opens many connections carrying no session
- THEN only a bounded number of refusals is recorded
- AND the rest are refused as too many and recorded once

#### Scenario: A connection sends faster than a screen does

- GIVEN a connection sending large frames at a steady pace
- WHEN it passes its budget
- THEN the connection ends with a code saying it sent too much
- AND little of what it sent reaches anybody

#### Scenario: A screen used hard

- GIVEN the application's own client in several tabs, reconnecting, opening many documents at once and typing fast
- WHEN it does so
- THEN no connection is refused or ended for its rate
