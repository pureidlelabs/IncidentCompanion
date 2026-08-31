# dependencies

## Purpose

What the application owes about the third-party versions it is built from: that the set is answerable without reading the tree, that a published vulnerability is answered rather than queued behind routine work, that a version is observed before it is adopted without a person looking, that anything deliberately held back carries its reason, and that a change to any of it is demonstrated before it reaches the release branch.

## ADDED Requirements

### Requirement: What is available is answerable without reading the tree

The versions the application is built from, and the newer versions available for them, SHALL be answerable from a single record. The record SHALL distinguish what has been adopted, what is available and unadopted, and what is deliberately held.

An operator or maintainer asking what the application is behind on MUST NOT have to inspect the tree, the registry, or a build log to find out.

#### Scenario: A newer version exists and nothing has adopted it

- **WHEN** a newer version of a dependency is published and the application has not adopted it
- **THEN** the record names the dependency, the adopted version and the available one
- **AND** it distinguishes that dependency from one that is held deliberately

#### Scenario: Nothing is outstanding

- **WHEN** every dependency is at the newest version its constraints permit
- **THEN** the record states that, rather than being absent or stale

### Requirement: A published vulnerability is answered without waiting

Where a version the application depends on is subject to a published vulnerability, a corrected version SHALL be offered for adoption without waiting out the observation period that governs routine adoption.

A vulnerability affecting a dependency reached only through another dependency SHALL be treated as affecting the application.

#### Scenario: A vulnerability is published against an adopted version

- **WHEN** a vulnerability is published against a version the application depends on
- **THEN** a corrected version is offered immediately
- **AND** the observation period governing routine adoption is not applied to it

#### Scenario: The vulnerable dependency is not a direct one

- **WHEN** the affected dependency is reached only through another dependency
- **THEN** it is treated as affecting the application, and is not excluded for being indirect

### Requirement: A version is observed before it is adopted unattended

A version SHALL NOT be adopted without a person's decision until it has been published for at least a defined minimum period. That period SHALL be recorded where the policy is stated, and MUST NOT be left to the judgement of whoever runs the adoption.

**Rationale:** A registry is a distribution channel an attacker can publish to. The period exists so that a compromised release is withdrawn before it is taken up, and it is therefore a floor rather than a delay to be waived when something is wanted quickly.

#### Scenario: A version is newer than the minimum period

- **WHEN** a version has been published for less than the defined period
- **THEN** it is not adopted without a person's decision
- **AND** the reason it was passed over is stated rather than the version being silently absent

#### Scenario: A person adopts it deliberately

- **WHEN** a person decides to adopt a version younger than the period
- **THEN** the adoption proceeds, and the decision is attributable

### Requirement: A dependency held below the latest version carries its reason

Where a dependency is deliberately held below the newest version available, the record SHALL carry the reason and the condition that would release it.

A hold MUST NOT outlive the condition that justifies it: when that condition no longer holds, the hold SHALL be surfaced rather than persisting silently.

**Rationale:** A held version and a neglected one are indistinguishable from the outside, and a hold whose reason has expired is how a tree falls behind while appearing deliberate.

#### Scenario: A dependency is held back

- **WHEN** a dependency is held below the newest available version
- **THEN** the record states what constrains it and what would release it

#### Scenario: The constraint that justified a hold is lifted

- **WHEN** the condition a hold names no longer applies
- **THEN** the hold is surfaced for removal rather than continuing to apply

#### Scenario: Two dependencies are held by the same constraint

- **WHEN** one constraint holds more than one dependency below its latest version
- **THEN** the record shows that they are released together, rather than presenting them as unrelated

### Requirement: A change to dependencies is demonstrated before it lands

A change to the versions the application is built from SHALL NOT reach the release branch until the verification suite has been demonstrated against it.

A tier that did not run SHALL NOT be counted as a pass. Where a tier cannot run, the result is that the change is undemonstrated, never that it succeeded.

**Rationale:** Parts of the suite decline to run rather than fail when what they need is absent, so a run that exercises nothing reports the same outcome as one that exercises everything.

#### Scenario: Every tier runs and passes

- **WHEN** a dependency change is verified and every tier runs
- **THEN** the change is eligible to reach the release branch

#### Scenario: A tier could not run

- **WHEN** a dependency change is verified and a tier declines to run
- **THEN** the change is reported as undemonstrated
- **AND** the tier that did not run is named

### Requirement: Two builds of one revision resolve the same versions

The components an installation is built from SHALL be identified precisely enough that two builds of the same revision resolve the same versions. This applies to every component the installation is assembled from, not only those the application declares directly.

#### Scenario: The same revision is built twice

- **WHEN** one revision is built on two occasions
- **THEN** both builds resolve the same versions of every component

#### Scenario: A component is identified by a moving name

- **WHEN** a component is identified by a name that can point at different content over time
- **THEN** that is a defect in the build's reproducibility rather than an accepted convenience
