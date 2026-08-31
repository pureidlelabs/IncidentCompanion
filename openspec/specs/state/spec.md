# State

## Purpose

Where what this application knows is kept, and what happens to each kind of it when the process stops.

The application holds two kinds of state, and they are not the same thing kept in two places. One is the record of investigations, which nothing may lose. The other is what makes a running install work — who is signed in, who is looking at what, how often somebody has asked — which the install may lose and rebuild.

This specification covers what each kind is, who may read it, and what survives a restart. The socket that carries live changes is its own specification; this one covers what that socket's state is made of.

## Requirements

### Requirement: What may be lost and what may not are separated by design

Every piece of state MUST be one of two things, and which one MUST be a decision rather than a consequence of where it happened to be written.

**Durable state** is the record of investigations: cases, what they hold, evidence, reports, the compliance record, accounts, groups, customers, and the log of who did what. Losing any of it MUST be a data loss incident.

**Ephemeral state** is what a running install needs to work: sessions, presence, claims, rate-limit counters, and anything derived that can be computed again.

Losing it and being unable to reach it are different events. **Losing all of it** MUST cost analysts their sign-in and nothing else. **Being unable to reach it** MUST stop the install serving, because a rate limit that cannot be counted and a session that cannot be checked are controls that have failed open.

A durable fact MUST NOT live only in ephemeral state. An ephemeral fact MUST NOT be written into durable state to make it survive, because that trades a restart for a table nobody prunes.

#### Scenario: The ephemeral store is emptied

- GIVEN an install with analysts signed in and working
- WHEN everything ephemeral is lost
- THEN no investigation has lost anything
- AND analysts sign in again and continue
- AND nothing had to be restored from a backup

#### Scenario: The ephemeral store is unavailable at start

- GIVEN an install whose ephemeral store cannot be reached
- WHEN it starts
- THEN it reports itself as unhealthy
- AND does not serve requests as though nothing were wrong

#### Scenario: A durable write is attempted while the ephemeral store is down

- GIVEN an install whose ephemeral store is unavailable
- WHEN an analyst attempts to change a case
- THEN the write is refused rather than accepted and forgotten

### Requirement: The application cannot reach a row it should not, even by mistake

The store MUST refuse rows outside the boundary the caller reaches, rather than returning them to an application trusted to filter.

The identity the application connects as MUST NOT be able to bypass that refusal. It MUST NOT be the identity that owns the schema, and MUST NOT hold the privileges that would let it read past a boundary or change the rules that define one.

Reading and changing case data MUST carry which case it is for, established once per operation, so that no individual statement is where the boundary is remembered.

#### Scenario: A query forgets its boundary

- GIVEN an operation reading case data
- WHEN a statement within it does not name the case
- THEN it returns nothing rather than everything

#### Scenario: The application attempts to widen its own reach

- GIVEN the identity the application connects as
- WHEN it attempts to disable or alter a boundary rule
- THEN the store refuses

#### Scenario: A new table holding case data is added

- GIVEN a new table holding rows belonging to a case
- WHEN it is added without a boundary rule
- THEN that omission fails loudly rather than serving every case's rows

### Requirement: Changing the shape of the store is a separate power

The identity that changes the shape of the store MUST NOT be the identity that serves requests, and MUST NOT be available to the running application.

Seeding demonstration content MUST be a third power of its own, so that neither of the others carries it.

#### Scenario: The application attempts to change the schema

- GIVEN the running application
- WHEN it attempts to create, alter or drop a table
- THEN it is refused

#### Scenario: A schema change is applied

- GIVEN a schema change
- WHEN it is applied with the identity that holds that power
- THEN it succeeds
- AND the application's own identity gained nothing by it

### Requirement: A version is what a write is checked against, and it lives with the row

Anything an analyst may change MUST carry a version that moves when it changes. A write MUST state the version it was made against and MUST be refused where that no longer matches.

The check and the record of the change MUST succeed or fail together. A change that is stored while its record is not leaves every other screen believing something that is no longer true.

#### Scenario: A write and its record are one act

- GIVEN a change to a case
- WHEN the change is stored
- THEN the record of it is stored in the same act
- AND no failure can leave one without the other

#### Scenario: A write arrives against a version that has moved

- GIVEN a row that has changed since a caller read it
- WHEN the caller writes against what it read
- THEN nothing is changed
- AND the caller is told what the row is on now

### Requirement: The store is not migrated while the shape is still moving

Data stored under an older shape MUST be refused rather than converted. A path that reads an older shape and adapts it MUST NOT exist.

This holds while the application is in development and nothing is installed. When something is installed the question reopens, and the answer it reopens as is reading forward from what is stored, never a ladder of per-version steps.

#### Scenario: Data from an older shape is presented

- GIVEN stored data written under an older shape
- WHEN the application encounters it
- THEN it is refused with what it is and what was expected
- AND nothing attempts to convert it

### Requirement: What is kept forever is decided, not defaulted

Durable state that grows without bound MUST have a stated life. The record of changes to a case, the log of administrative acts and anything else that accumulates MUST each say how long it is kept and what happens at the end of it.

An install MUST NOT reach a state where the only way to keep working is to delete something nobody decided was disposable.

Where a retention period is set by an obligation rather than by preference, the obligation MUST be named, and shortening it below what the obligation requires MUST be refused.

#### Scenario: A record reaches the end of its life

- GIVEN a record whose retention period has passed
- WHEN the install prunes it
- THEN the pruning is itself recorded
- AND what was pruned is describable afterwards without being recoverable

#### Scenario: A retention period is shortened below an obligation

- GIVEN a retention period set to satisfy a regulatory obligation
- WHEN somebody sets it shorter
- THEN it is refused
- AND they are told which obligation it answers

### Requirement: Evidence is wrapped, and the wrapping is containment rather than confidentiality

Evidence is a file taken from a compromised system. It MUST be stored wrapped, so that nothing between the store and the analyst treats it as a live file — and the thing that most reliably does is the defender's own endpoint protection, which will quarantine an artefact out from under the row that describes it.

The wrapping MUST use the convention the industry already agreed on for handling specimens, so that an analyst who meets it recognises it and their own tooling opens it. **Its password is not a secret and MUST NOT be treated as one.** It protects nothing; it stops software along the path from acting on the contents.

What is stored MUST be what is served. An analyst downloading evidence receives it wrapped, because unwrapping it on the way out puts a live artefact on their machine while their protection is watching.

Identity MUST be taken from the artefact rather than from its wrapper: a wrapper is not reproducible byte for byte, so the same file wrapped twice is the same evidence.

Nothing MUST expand, execute or interpret an artefact to decide what it is.

#### Scenario: Evidence is stored

- GIVEN a file taken from a compromised system
- WHEN it is stored
- THEN it is wrapped before it is written
- AND nothing expands or interprets it to categorise it

#### Scenario: The same artefact arrives twice

- GIVEN an artefact already stored
- WHEN the same bytes are stored again
- THEN it is recognised as the same evidence
- AND the difference between the two wrappers does not make it a second artefact

#### Scenario: Evidence is downloaded

- GIVEN stored evidence
- WHEN an analyst retrieves it
- THEN they receive it wrapped, as stored
- AND their own protection does not remove it in transit

#### Scenario: Somebody treats the wrapping as protection

- GIVEN evidence at rest
- WHEN the question is whether its contents are confidential
- THEN the answer is that the wrapping does not make them so

**Confidentiality at rest is the operator's, and the application MUST say so rather than assume it.** The storage this runs on belongs to whoever installed it — their disks, their volumes, their platform — and encrypting them is a decision they have already taken for everything else they run. This application MUST NOT encrypt durable state itself, because doing so would put a key it manages in front of storage the operator already protects, and would make recovery depend on that key surviving.

What it MUST do is state the assumption: an install MUST be able to tell an operator that its durable state, including evidence, is stored unencrypted by the application and relies on the storage beneath it. An operator who has not encrypted that storage MUST be able to learn it from the application rather than from an auditor.


### Requirement: What is stored can be recovered, and the recovery is proven

An install MUST be able to produce a copy of its durable state, and MUST be able to return to that copy.

A copy that has never been restored is a belief rather than a backup. The install MUST make restoring it something an operator can do deliberately, rather than something first attempted during an incident.

Ephemeral state MUST NOT be part of a copy. Restoring MUST NOT restore somebody's session.

**Evidence is copied beside the database, not inside it.** Artefacts are large, they never change once written, and copying them into every database dump would make the routine copy expensive enough that an operator takes it less often — which is the failure that matters more than any of the others here.

The cost of that is two things an operator must keep together, and the application MUST answer it rather than leave it to discipline. A copy of the database MUST name which artefacts it expects to find beside it, so that a restore can say what is missing rather than discovering it when somebody opens a case. Neither copy MUST be presented as sufficient alone.

#### Scenario: An install is restored from a copy

- GIVEN a copy of an install's durable state
- WHEN it is restored
- THEN every case, its evidence and its record are as they were
- AND nobody is signed in

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
