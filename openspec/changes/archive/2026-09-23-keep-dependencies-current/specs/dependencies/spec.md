# dependencies

## Purpose

What the application owes about the third-party versions it is built from: that the set is answerable without reading the tree, that a published vulnerability is answered rather than queued behind routine work, that a version is observed before it is adopted without a person looking, that anything deliberately held back carries its reason, that a change to any of it is demonstrated before it reaches the release branch, and that two builds of one revision are built from the same things.

## ADDED Requirements

### Requirement: What is available is answerable without reading the tree

The versions the application is built from, and the newer versions available for them, SHALL be answerable from a single record. The record SHALL distinguish what has been adopted, what is available and unadopted, and what is deliberately held.

An operator or maintainer asking what the application is behind on MUST NOT have to inspect the tree, the registry, or a build log to find out.

#### Scenario: A newer version exists and nothing has adopted it

- GIVEN a newer version of a dependency, published and not adopted by the application
- WHEN the record is read
- THEN it names the dependency, the adopted version and the available one
- AND it distinguishes that dependency from one that is held deliberately

#### Scenario: Nothing is outstanding

- GIVEN every dependency at the newest version its constraints permit
- WHEN the record is read
- THEN it states that, rather than being absent or stale

### Requirement: A published vulnerability is answered without waiting

Where a version the application depends on is subject to a published vulnerability, a corrected version SHALL be offered for adoption without waiting out the observation period that governs routine adoption.

A vulnerability affecting a dependency reached only through another dependency SHALL be treated as affecting the application.

#### Scenario: A vulnerability is published against an adopted version

- GIVEN a version the application depends on
- WHEN a vulnerability is published against it
- THEN a corrected version is offered immediately
- AND the observation period governing routine adoption is not applied to it

#### Scenario: The vulnerable dependency is not a direct one

- GIVEN a dependency reached only through another dependency
- WHEN a vulnerability is published against it
- THEN it is treated as affecting the application, and is not excluded for being indirect

### Requirement: A version is observed before it is adopted unattended

A version SHALL NOT be adopted without a person's decision until it has been published for at least a defined minimum period. That period SHALL be recorded where the policy is stated, and MUST NOT be left to the judgement of whoever runs the adoption.

**Rationale:** A registry is a distribution channel an attacker can publish to. The period exists so that a compromised release is withdrawn before it is taken up, and it is therefore a floor rather than a delay to be waived when something is wanted quickly.

#### Scenario: A version is newer than the minimum period

- GIVEN a version published for less than the defined period
- WHEN adoption runs without a person
- THEN the version is not adopted
- AND the reason it was passed over is stated rather than the version being silently absent

#### Scenario: A person adopts it deliberately

- GIVEN a version published for less than the defined period
- WHEN a person decides to adopt it
- THEN the adoption proceeds, and the decision is attributable

### Requirement: A dependency held below the latest version carries its reason

Where a dependency is deliberately held below the newest version available, the record SHALL carry the reason and the condition that would release it.

A hold MUST NOT outlive the condition that justifies it: when that condition no longer holds, the hold SHALL be surfaced rather than persisting silently.

**Rationale:** A held version and a neglected one are indistinguishable from the outside, and a hold whose reason has expired is how a tree falls behind while appearing deliberate.

#### Scenario: A dependency is held back

- GIVEN a dependency held below the newest available version
- WHEN the record is read
- THEN it states what constrains the dependency and what would release it

#### Scenario: The constraint that justified a hold is lifted

- GIVEN a hold that names the condition justifying it
- WHEN that condition no longer applies
- THEN the hold is surfaced for removal rather than continuing to apply

#### Scenario: Two dependencies are held by the same constraint

- GIVEN one constraint holding more than one dependency below its latest version
- WHEN the record is read
- THEN it shows that they are released together, rather than presenting them as unrelated

### Requirement: A change to dependencies is demonstrated before it lands

A change to the versions the application is built from SHALL NOT reach the release branch until the verification suite has been demonstrated against it.

A tier that did not run SHALL NOT be counted as a pass. Where a tier cannot run, the result is that the change is undemonstrated, never that it succeeded.

**Rationale:** Parts of the suite decline to run rather than fail when what they need is absent, so a run that exercises nothing reports the same outcome as one that exercises everything.

#### Scenario: Every tier runs and passes

- GIVEN a change to the versions the application is built from
- WHEN it is verified and every tier runs and passes
- THEN the change is eligible to reach the release branch

#### Scenario: A tier could not run

- GIVEN a change to the versions the application is built from
- WHEN it is verified and a tier declines to run
- THEN the change is reported as undemonstrated
- AND the tier that did not run is named

### Requirement: Two builds of one revision resolve the same versions

The components an installation is built from SHALL be identified precisely enough that two builds of the same revision resolve the same versions. This applies to every component the installation is assembled from, not only those the application declares directly.

#### Scenario: The same revision is built twice

- GIVEN one revision
- WHEN it is built on two occasions
- THEN both builds resolve the same versions of every component

#### Scenario: A component is identified by a moving name

- GIVEN a component identified by a name that can point at different content over time
- WHEN an installation is built from it
- THEN that is a defect in the build's reproducibility rather than an accepted convenience
