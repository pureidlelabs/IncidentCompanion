# State

## MODIFIED Requirements

### Requirement: Evidence is wrapped, and the wrapping is containment rather than confidentiality

Evidence is a file taken from a compromised system. It MUST be stored wrapped, so that nothing between the store and the analyst treats it as a live file — and the thing that most reliably does is the defender's own endpoint protection, which will quarantine an artefact out from under the row that describes it.

The wrapping MUST use the convention the industry already agreed on for handling specimens, so that an analyst who meets it recognises it and their own tooling opens it. **Its password is not a secret and MUST NOT be treated as one.** It protects nothing; it stops software along the path from acting on the contents.

What is stored MUST be what is served. An analyst downloading evidence receives it wrapped, because unwrapping it on the way out puts a live artefact on their machine while their protection is watching.

Identity MUST be taken from the artefact rather than from its wrapper: a wrapper is not reproducible byte for byte, so the same file wrapped twice is the same evidence.

Nothing MUST expand, execute or interpret an artefact to decide what it is.

**Confidentiality at rest is the operator's, and the application MUST say so rather than assume it.** The storage this runs on belongs to whoever installed it — their disks, their volumes, their platform — and encrypting them is a decision they have already taken for everything else they run. This application MUST NOT encrypt durable state itself, because doing so would put a key it manages in front of storage the operator already protects, and would make recovery depend on that key surviving.

What it MUST do is state the assumption: an install MUST be able to tell an operator that its durable state, including evidence, is stored unencrypted by the application and relies on the storage beneath it. An operator who has not encrypted that storage MUST be able to learn it from the application rather than from an auditor.

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

#### Scenario: An operator asks what protects the state at rest

- GIVEN an install holding a database, a cache and stored evidence
- WHEN an operator asks the install how that state is protected
- THEN it says the application writes all of it unencrypted
- AND it says confidentiality at rest is whatever the storage underneath provides
- AND evidence is named rather than left to be assumed either way
