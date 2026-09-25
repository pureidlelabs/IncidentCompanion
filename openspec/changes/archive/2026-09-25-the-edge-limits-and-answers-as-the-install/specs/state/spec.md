# State

## MODIFIED Requirements

### Requirement: What is stored can be recovered, and the recovery is proven

An install MUST be able to produce a copy of its durable state, and MUST be able to return to that copy.

A copy that has never been restored is a belief rather than a backup. The install MUST make restoring it something an operator can do deliberately, rather than something first attempted during an incident.

Ephemeral state MUST NOT be part of a copy. Restoring MUST NOT restore somebody's session.

**A copy MUST be readable only by whoever took it.** It holds every case, every artefact and every account's password hash, and a copy more open than the state it was taken from is the easiest way to that state.

**Evidence is copied beside the database, not inside it.** Artefacts are large, they never change once written, and copying them into every database dump would make the routine copy expensive enough that an operator takes it less often — which is the failure that matters more than any of the others here.

The cost of that is two things an operator must keep together, and the application MUST answer it rather than leave it to discipline. A copy of the database MUST name which artefacts it expects to find beside it, so that a restore can say what is missing rather than discovering it when somebody opens a case. Neither copy MUST be presented as sufficient alone.

A copy MUST be checked before it is trusted, and a copy the install cannot return to whole MUST be refused before anything is changed.

#### Scenario: An install is restored from a copy

- GIVEN a copy of an install's durable state
- WHEN it is restored
- THEN every case, its evidence and its record are as they were
- AND nobody is signed in

#### Scenario: A copy is taken

- GIVEN a running install
- WHEN an operator takes a copy of it
- THEN the copy, and every part of it, is readable by that operator's account alone

#### Scenario: Only the database was restored

- GIVEN a database copy restored without the artefacts beside it
- WHEN the install starts
- THEN it says how many artefacts it expects and cannot find
- AND does not wait for somebody to open a case to discover it

#### Scenario: A case is opened with its evidence missing

- GIVEN a restored install missing some artefacts
- WHEN an analyst opens a case that referenced one
- THEN the case says that piece of evidence is absent
- AND does not present an incomplete case as a whole one

#### Scenario: The artefacts are restored afterwards

- GIVEN an install restored without its artefacts
- WHEN the artefacts are put back beside it
- THEN the evidence is whole again
- AND nothing had to be re-recorded

#### Scenario: A damaged copy is checked

- GIVEN a copy whose database or evidence was cut short or altered after it was taken
- WHEN it is checked
- THEN it is refused, saying which part is not whole

#### Scenario: A copy from another shape is restored

- GIVEN a copy taken under a different shape of the store
- WHEN it is restored
- THEN it is refused, saying what the copy is and what was expected
- AND the install is as it was before the attempt
