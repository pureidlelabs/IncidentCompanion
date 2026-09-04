<!--
Version 1.0.0, unratified. The maintainer signs off once specifications exist, because this document is deliberately abstract and is expected to grow concrete from them.

Each article states a property the system must have -- never the mechanism that achieves it, and never what the code does today. Four earlier drafts were discarded for carrying one or the other.

Open:
  - RATIFICATION.
  - Quality gates is unwritten. It is filled from what the first specifications need.
  - Cross-case reach is a security boundary that is not built. It is the first entry in
    the deviation register.

The condensed form in openspec/config.yaml is what reaches every generated artifact. Changing an article here means changing that too. -->

# IncidentCompanion Constitution

IncidentCompanion is a self-hosted application for building a root cause analysis and running the investigation side of an MXDR/SOC incident.

Each article states a property the system must have. It says nothing about how that property is achieved, and nothing about whether the code achieves it yet — the first belongs to a specification, and the second is what a specification is checked against.

## Core Principles

### I. The system is multi-user by construction

Several analysts work one case at once, and every part of the system MUST behave correctly when a second analyst acts on the same thing at the same moment.

A component MUST NOT be built for a single occupant and widened afterwards.

**Rationale:** Retrofitting concurrency means retrofitting attribution, and attribution cannot be recovered once it was never captured.

### II. Every change to case data is attributed and ordered

Who made a change, and what state it was made against, MUST be recoverable for every change. A change that cannot be attributed to a person, or placed after the change it was based on, MUST be refused rather than accepted.

A refusal is an answer. Where two analysts change the same thing, the system MUST say so rather than silently keeping one of the two.

The record MUST NOT be suppressible by whoever it would record. Where a change cannot be recorded, it MUST NOT be made.

**Rationale:** An investigation's conclusions are only as defensible as the record of who concluded what, and against which evidence. A change nobody can attribute is a change nobody can defend.

### III. Security decisions are made in one place, and default to closed

Whether a caller may reach something MUST be decided once, never re-decided by each thing that serves it.

Access MUST be refused unless something explicitly grants it, and every grant MUST be a decision somebody made rather than a default somebody inherited.

**One grant is the system's own, and it is the only one.** Work that has not yet been attributed to anybody belongs to whoever can act on it, and reach to it is a property of the system rather than a decision about a person. That grant MUST reach nothing that has been attributed: the moment work belongs to somebody identified, it leaves, and reach to it is decided like everything else. Any second exception to this article is an amendment, not an interpretation.

**Rationale:** A rule spread across its enforcement points is re-audited whenever one is added, and that audit is the step that gets skipped.

### IV. An operational risk is not always a technical problem

What a system makes possible and what an organisation permits are different questions. The second belongs to whoever runs the install — their screening, their separation of duty, their approvals, their procedure — and answering it in code takes a decision away from the people whose risk it is.

Where a risk is operational, the system's obligation is to make the act possible, attributable, and visible in a record the organisation can audit against its own controls. It MUST NOT build the workflow that enforces somebody else's policy, and MUST NOT restrict a legitimate act because the policy governing it might be abused.

This is not licence to ignore a technical control that belongs here. A boundary the system alone can enforce — who a request is served as, which customer's data it may reach, whether a write is attributed — is the system's, and an operational argument does not excuse leaving it open.

### V. The core is self-contained

A working installation MUST require nothing that whoever runs it does not control. No call home, no vendor service, no content fetched from a third party at run time, no telemetry. An installation with nothing configured MUST be complete, and MUST make no outbound request at all.

Where an operator points the application at their own infrastructure — their identity provider, their log destination, their storage — that is their dependency and their decision. The test is who owns the thing at the other end, never whether a packet leaves. An operator's own systems are inside the boundary they are defending; a vendor's are not.

The core MUST NOT run anybody else's code. Executing a third party's logic inside this application is not a capability the core provides.

**Rationale:** This application is installed inside the network it is used to defend, frequently in environments with no outbound route at all. Anything it reaches for on its own account is something an operator must justify to their own security team; anything they point it at themselves, they have already justified.

### VI. Controls come from one accessible kit

Every control an analyst touches MUST come from a single kit, built on a foundation supplying keyboard behaviour, focus management and screen-reader semantics.

A control MUST NOT be assembled where it is used. A control built where it is needed is one nobody documented, nobody can find, and nobody drove with a keyboard — and accessibility is the part whose absence goes unnoticed longest.

WCAG 2.2 Level AA is the guideline this article aims at. It is not an obligation: no law requires it of this application, since the European Accessibility Act reaches consumer services and excludes those supplied to people acting professionally, and EN 301 549 binds public sector bodies and those selling to them. A requirement MUST NOT be refused solely for missing it, and an EU public sector buyer would turn EN 301 549 into a procurement requirement that this section would then have to answer properly.

### VII. Licensed AGPL-3.0-only

Everything added MUST remain compatible with AGPL-3.0-only distribution.

**Rationale:** A single incompatible dependency makes the whole work undistributable, and the discovery happens at release rather than at import.

## Security and compliance grounding

Security decisions are grounded in published standards rather than in judgement, and the standard is named where the decision is made. These are the references this application is designed against; none is a certification claim.

**OWASP ASVS 5.0, Level 2** is the grounding for application security.

A requirement carrying a security property MUST be traceable to the controls it answers, and the trace lives in a coverage matrix rather than inline. A specification states the behaviour; the matrix maps behaviour to control identifiers and shows which controls nothing answers. Citing identifiers inside a requirement puts a version number the standard owns into prose nobody re-reads when the standard moves, and the gap that matters -- a control nothing answers -- cannot be seen from any single specification.

The matrix is `openspec/matrix/`. A security-bearing requirement that it does not trace is an incomplete requirement, and a control it shows nothing answering is either a gap to close or a deviation to record.

**Audit logging** answers ISO/IEC 27002 control 8.15 and the NIST SP 800-53 AU control family. Administrative events MUST be logged: a change to an account, a group, an authorisation, or the state that locks somebody out is an administrative event, and so is the configuration of logging itself. These controls are traced in the coverage matrix, like every other. NIST SP 800-92 is the design reference for how log management is structured; it is guidance rather than a control set, so it is not cited per requirement.

**CIS Benchmarks, Level 1 where applicable and Level 2 where it costs nothing**, govern the configuration of the components the application is deployed on. A benchmark is checked against a running stack by tooling; it is never satisfied by a statement in a specification.

**A deviation is recorded, never left implicit.** Where a control is knowingly unmet, the deviation is written down with the control identifier, the reason, and what would change the decision. An unmet control that nobody enumerated is indistinguishable from one nobody found.

**Reach between cases is a security boundary.** An analyst holding a session is authorised to use the application, never to reach every case in it. A control that keeps one case out of another is a security control, and its absence is a finding rather than a missing feature.

**The deviation register is a section of this file**, so the list of knowingly unmet controls is read by anyone who reads the standards they deviate from.

### Deviation register

| Control | Deviation | Reason | What would close it |
| --- | --- | --- | --- |
| Article IV, separation of duty | An administrator can grant themselves data-plane access to any customer's cases. | Deliberate. Separation of duty is an operational control belonging to the organisation running the install, and the product answers it with an attributable record rather than a restriction. | Nothing here. It closes in the operator's own procedure, against the log. |
| Article IV, separation of duty | The management role carries a data-plane level over one customer: an administrator reaches the default customer at delete with no grant behind it. | Deliberate. It reaches only the record standing for incidents nobody has been named for, which are nobody's data, and it is what lets an install dispose of an untriaged case without first building the access model to get at a case nobody owns. It reaches no customer somebody has been onboarded as, and it is stated as the floor rather than checked at the door, so one place answers what an account reaches. | Attributing a case when it is created. The default customer would then hold only what nobody has named, and the exception would reach that much and no more. -> #131 |
| ASVS 5.0 L2, multi-factor authentication | No second factor is offered at all. An account is reached with a password and nothing else. | Not built. `auth/lockout.ts` says so in the source -- *"two-factor verification, which this install does not offer"*. The requirement is kept normative and recorded as unbuilt rather than deferred, because a security product reached over a network owes L2 an authenticator. | Building it. The requirement already makes enforcement the install's policy, so what is missing is the factor itself rather than the choice about it. |
| ASVS 5.0 L2, V14.1.1 and V14.1.2, data classification | No data is classified, so no protection requirement is stated per classification. | Deliberate. Classification is a product decision nobody has taken, and inventing one to satisfy a control would produce levels nothing enforces. Encryption at rest, which this control usually drives, is Article IV: the storage belongs to the operator and the application states its assumption rather than encrypting over them. | Classifying what the application holds -- case content, evidence, identity, the audit record -- and stating what each level requires. |
| ASVS 5.0 L2, V3.4.1, transport security across subdomains | The install tells a browser to keep its own name protected, and says nothing about names below it. The control requires the policy to cover subdomains at Level 2. | Deliberate. An install speaks for the name it is reached at; names below it belong to whoever runs the domain, and an install cannot withdraw an instruction it had no standing to give. Applied at a loopback address the instruction would reach every application on the machine. | Nothing in the product. It closes where an operator runs the install on a name whose subdomains are theirs, and chooses to say so. |
| ASVS 5.0 L2, V12.2.2, publicly trusted certificate | The install generates its own certificate at first start and it is not publicly trusted. | Unavoidable rather than chosen. An install reached at a loopback address on somebody's private network cannot obtain a publicly trusted certificate, and refusing to serve without one would mean refusing to serve. | An operator supplying their own certificate, from whatever authority their organisation already trusts. The install must accept one. |


## Quality gates

**A requirement is met when its scenarios are demonstrated, and not before.** The scenarios are the gate: each states a condition, an action and an observable result, and each is written before the thing it describes is built.

That ordering is the whole point, and it is what the old discipline could not provide. A test written after the code, by whoever wrote the code, breaks in the way its author already had in mind — the mutation and the test come from one imagination, so a red result proves the test is awake and says nothing about the feature. A scenario written from what the application must do, before anybody chose how, is not from that imagination.

**A check earns its place by catching something nobody was looking for.** Breaking the code on purpose and watching a check fail establishes that the check is connected to something, and nothing more — it is a test of the test. The mutation is chosen by whoever wrote the assertion, so it can only confirm what they already believed. Effort spent proving checks are awake is effort not spent demonstrating that the application is right.

**What the gate counts is scenarios demonstrated, never lines executed.** Coverage of lines measures how much of an implementation ran. Coverage of scenarios measures how much of the specification is true. An implementation can execute every line while satisfying none of them.

**A scenario nothing can demonstrate MUST be recorded as such, and MUST NOT be counted.** Some are honestly unautomatable — an operator is told, an analyst can tell at a glance, a refusal reveals nothing by its timing. Those are demonstrated by somebody looking, or they are not demonstrated. A specification that quietly counts them as covered is worse than one admitting the gap, because the gap is then invisible rather than merely open.

**A requirement is not deleted for being unimplemented.** Whether it belongs is a question about the product this is meant to be, and the answer does not change because a version does not have it yet. A requirement that belongs stays normative and is recorded as unbuilt; one that does not belong is removed because the product was described wrongly, and the removal says so. Deleting on the ground of absence alone quietly turns every backlog into a specification, and the specification then agrees with whatever was built.

**A scenario whose subject does not exist MUST be recorded as unbuilt, and MUST NOT be counted as demonstrated or as undemonstrable.** The two are different facts: undemonstrable means no test could ever show it, and unbuilt means a test could show it the day the thing exists. Collapsing them loses the distinction between a gap in the instrument and a gap in the product, which are planned differently and by different people.

**Four numbers MUST be answerable at any moment**: how many scenarios exist, how many are demonstrated, how many are recorded as undemonstrable, and how many describe something the product does not yet have. A gate that cannot say which of its requirements are unproven is a gate that has already stopped being one, and one that cannot separate *unproven* from *unbuilt* reports a test backlog where half of it is a build backlog.

**A test written against an implementation is not evidence that a specification is met.** It was written from what the code does, so it passes while the specification it was never shown remains unmet. Such a test is evidence where it happens to demonstrate a scenario, and evidence of nothing on its own — however much of the implementation it covers.

## Governance

This constitution supersedes other practice. Where a document, a note or a habit disagrees with it, this file wins.

**Amendment.** An amendment is a change to this file, versioned and dated in the line that closes it. An article carrying a `[NEEDS CLARIFICATION]` marker is a draft, is not cited as settled, and resolving the marker is itself an amendment.

**Promotion from specifications.** This document is deliberately abstract, and it is expected to grow concrete from below rather than from argument. A constraint that appears in three or more specifications is a candidate for promotion to an article; a constraint appearing in one is a detail of that specification and stays there. A convergence finding that no article covers is the other trigger: it means the specifications are enforcing something this document failed to say.

Promotion is an amendment and takes a MINOR bump. Nothing is promoted because it seems important; it is promoted because it repeated.

**Versioning.** Semantic versioning. MAJOR for a backward-incompatible removal or redefinition of an article; MINOR for a new article or materially expanded guidance; PATCH for wording.

**Compliance.** Code that violates an article is the highest-severity finding available. An article that has come to name a mechanism, or to describe what the code does today, has drifted into specification and is rewritten as a property.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): awaiting maintainer sign-off | **Last Amended**: 2026-08-29
