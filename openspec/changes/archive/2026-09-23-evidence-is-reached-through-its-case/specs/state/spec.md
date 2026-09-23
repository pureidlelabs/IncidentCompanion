# State

## ADDED Requirements

### Requirement: An artefact is reached only through the case that holds it

An attached artefact MUST be reachable only through the case that stored it. Its digest names the content and never grants it: digests travel by design, in a case's evidence list, in a report's register and in an archive written without its attachments, so naming one from any other case, in a row, a report or an archive read in, MUST reach nothing.

Nothing produced MUST say whether the install holds an artefact another case stored. What a case produces while naming such a digest MUST be what it would produce had nobody ever held the artefact.

The same bytes attached in two cases MUST be held by each on its own, so that neither case's fate reaches the other's and neither is told what the other called the file.

What a case stored MUST leave the install with the case. Bytes a case holds that none of its evidence records says it holds, and that no report it sent was sent with, MUST NOT outlive the next start.

#### Scenario: A digest is named in another case

- GIVEN an artefact stored in one case
- AND another case, of any customer, naming its digest
- WHEN that other case is archived with its files, or its report is produced or sent
- THEN the artefact is in none of what it produces
- AND nothing produced differs from what a digest nobody holds produces

#### Scenario: Reach is withdrawn from an analyst who read a digest

- GIVEN an analyst who read a case's evidence and then lost reach to it
- WHEN they name its digests in a case of their own
- THEN they are given none of its artefacts

#### Scenario: A handover is read in by somebody who does not reach the case

- GIVEN an archive of a case written without its attachments
- WHEN an analyst who does not reach that case reads it in and archives it with its files
- THEN the archive carries none of the attachments the handover left behind
- AND it does not say the install lost them

#### Scenario: The same artefact is attached in two cases

- GIVEN the same bytes attached in two cases
- WHEN one of the cases is deleted
- THEN the other still holds and serves its own copy
- AND its download names the file as that case named it

#### Scenario: An artefact nothing names any more

- GIVEN bytes a case holds whose evidence record was deleted or now names other bytes, and which no report the case sent was sent with
- WHEN the install next starts
- THEN they are gone
- AND every report the case sent still draws each figure it was sent with

## MODIFIED Requirements

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

- GIVEN an artefact already stored in a case
- WHEN the same bytes are stored again in that case
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

#### Scenario: An operator asks what protects the state at rest

- GIVEN an install holding a database, a cache and stored evidence
- WHEN an operator asks the install how that state is protected
- THEN it says the application writes all of it unencrypted
- AND it says confidentiality at rest is whatever the storage underneath provides
- AND evidence is named rather than left to be assumed either way

**Confidentiality at rest is the operator's, and the application MUST say so rather than assume it.** The storage this runs on belongs to whoever installed it — their disks, their volumes, their platform — and encrypting them is a decision they have already taken for everything else they run. This application MUST NOT encrypt durable state itself, because doing so would put a key it manages in front of storage the operator already protects, and would make recovery depend on that key surviving.

What it MUST do is state the assumption: an install MUST be able to tell an operator that its durable state, including evidence, is stored unencrypted by the application and relies on the storage beneath it. An operator who has not encrypted that storage MUST be able to learn it from the application rather than from an auditor.
