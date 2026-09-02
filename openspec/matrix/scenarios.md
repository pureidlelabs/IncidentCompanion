# Scenario ledger

**The constitution requires three numbers to be answerable at any moment**: how many scenarios exist, how many are demonstrated, and how many are recorded as undemonstrable. This is where they are answered. `tests/docs/test_scenario_ledger.py` holds it against the specifications, so a scenario cannot be added, renamed or removed without this file being brought with it.

| | |
| --- | --- |
| Scenarios | 428 |
| Demonstrated | 217 |
| Undemonstrable | 0 |
| Undemonstrated | 211 |

**Every scenario starts undemonstrated, and that is the honest reading rather than a regression.** A scenario is demonstrated when somebody has read it against the thing that demonstrates it and said so here. Nothing has been traced yet, so nothing is claimed.

**A test passing is not by itself a demonstration.** The constitution is explicit: a test written against an implementation was written from what the code does, so it passes while the specification it was never shown remains unmet. Citing one here is a claim that somebody read the scenario and the test together and found the second to demonstrate the first.

## How a row is filled in

**`demonstrated`** names what demonstrates it, as a path from the repository root. The path must exist.

**`undemonstrable`** carries the reason instead. Some scenarios are honestly beyond automation -- an operator is told, an analyst can tell at a glance, a refusal reveals nothing by its timing. Those are demonstrated by somebody looking, or they are not demonstrated at all, and the constitution requires that they are recorded rather than quietly counted.

**`undemonstrated`** carries nothing. It is the default and it is not a failure; it is the state of a scenario nobody has traced.

## accounts-and-access

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| An account is provisioned, never self-created | An install with no accounts is claimed | undemonstrated | |
| An account is provisioned, never self-created | Somebody reaches the service first | undemonstrated | |
| An account is provisioned, never self-created | Two claims arrive together | undemonstrated | |
| An account is provisioned, never self-created | The claim is attempted twice | undemonstrated | |
| An account is provisioned, never self-created | A new account reaches nothing | undemonstrated | |
| Managing the install and reaching case data are separate grants | An administrator has granted themselves no data access | undemonstrated | |
| Managing the install and reaching case data are separate grants | An analyst with wide data access administers nothing | demonstrated | server/test/wide-reach-administers-nothing.test.ts |
| Managing the install and reaching case data are separate grants | An administrator grants themselves access | demonstrated | server/src/access/groups.controller.test.ts |
| Case data is reached through groups, at a level | A group is built for a sector | demonstrated | server/src/access/reach.test.ts |
| Case data is reached through groups, at a level | Two memberships disagree | demonstrated | server/src/access/reach.test.ts |
| Case data is reached through groups, at a level | A level is reduced while the analyst is working | undemonstrated | |
| Case data is reached through groups, at a level | Reach is withdrawn while the analyst is working | undemonstrated | |
| Case data is reached through groups, at a level | An analyst removes something inside a case | undemonstrated | |
| Case data is reached through groups, at a level | An analyst attempts to delete the case itself | demonstrated | server/test/the-level-survives-the-spelling.test.ts |
| Case data is reached through groups, at a level | The default customer cannot be withheld | demonstrated | server/src/access/reach.test.ts |
| An install always has somebody who can administer it | The last administrator is removed | demonstrated | server/test/last-admin-role.test.ts |
| An install can be recovered without another administrator | The install is claimed | undemonstrated | |
| An install can be recovered without another administrator | An install runs on a single administrator | undemonstrated | |
| An install can be recovered without another administrator | An administrator forgets their password | undemonstrated | |
| An install can be recovered without another administrator | The last administrator is locked out | undemonstrated | |
| An install can be recovered without another administrator | The recovery credential is used to read a case | undemonstrated | |
| An install can be recovered without another administrator | The credential is guessed at | undemonstrated | |
| An install can be recovered without another administrator | A new credential is issued | undemonstrated | |
| An install can be recovered without another administrator | The credential is lost | undemonstrated | |
| Authentication resists guessing, and says so to the auditor | Repeated failures lock an account | demonstrated | server/test/account-lockout.test.ts |
| Authentication resists guessing, and says so to the auditor | A locked account reveals nothing | undemonstrated | |
| Authentication resists guessing, and says so to the auditor | An account must change its password | demonstrated | server/test/password-hold-clears.test.ts |
| A second factor is available, and enforcing it is the install's policy | The policy is off | undemonstrated | |
| A second factor is available, and enforcing it is the install's policy | An analyst enrols anyway | undemonstrated | |
| A second factor is available, and enforcing it is the install's policy | The policy is turned on | undemonstrated | |
| A second factor is available, and enforcing it is the install's policy | A correct password is not enough | undemonstrated | |
| A second factor is available, and enforcing it is the install's policy | An analyst loses their authenticator | undemonstrated | |
| A second factor is available, and enforcing it is the install's policy | An analyst has neither authenticator nor codes | undemonstrated | |
| A second factor is available, and enforcing it is the install's policy | The install reports its own posture | undemonstrated | |
| An install can federate its sign-in to the organisation's identity provider | An analyst signs in through the provider | undemonstrated | |
| An install can federate its sign-in to the organisation's identity provider | The provider is unreachable | undemonstrated | |
| An install can federate its sign-in to the organisation's identity provider | Federation is broken rather than unreachable | undemonstrated | |
| An install can federate its sign-in to the organisation's identity provider | An analyst leaves the organisation | undemonstrated | |
| An install can federate its sign-in to the organisation's identity provider | An administrator asks how stale an answer is | undemonstrated | |
| An install can federate its sign-in to the organisation's identity provider | Federation is off | undemonstrated | |
| An install can federate its sign-in to the organisation's identity provider | A federated analyst has no second factor here | undemonstrated | |
| An install can federate its sign-in to the organisation's identity provider | A federated account has no password here | undemonstrated | |
| An install can federate its sign-in to the organisation's identity provider | The last local administrator is federated away | undemonstrated | |
| An install can federate its sign-in to the organisation's identity provider | Federation is turned off with federated accounts in place | undemonstrated | |
| An install can federate its sign-in to the organisation's identity provider | A mapping is configured | undemonstrated | |
| An install can federate its sign-in to the organisation's identity provider | An analyst arrives with an unmapped claim | undemonstrated | |
| An install can federate its sign-in to the organisation's identity provider | Somebody is added to a group at the provider | undemonstrated | |
| An install can federate its sign-in to the organisation's identity provider | Somebody is removed at the provider | undemonstrated | |
| An install can federate its sign-in to the organisation's identity provider | Somebody must lose access now | undemonstrated | |
| An install can federate its sign-in to the organisation's identity provider | A mapping is removed | undemonstrated | |
| An install can federate its sign-in to the organisation's identity provider | An analyst is reached both ways | undemonstrated | |
| A session belongs to its holder and ends when it should | An administrator ends a session | undemonstrated | |
| A session belongs to its holder and ends when it should | A session goes idle | undemonstrated | |
| A session belongs to its holder and ends when it should | A session reaches its absolute lifetime | undemonstrated | |
| A session belongs to its holder and ends when it should | An analyst reviews their own sessions | undemonstrated | |
| A session belongs to its holder and ends when it should | Every session is ended at once | undemonstrated | |
| An administrator can see who reaches what, and why | An administrator reviews access | undemonstrated | |
| An administrator can see who reaches what, and why | An administrator asks why | undemonstrated | |
| An administrator can see who reaches what, and why | An administrator asks from the customer's side | undemonstrated | |
| An administrator can see who reaches what, and why | Somebody who has never signed in | undemonstrated | |
| An administrator can see who reaches what, and why | An account has never been used | undemonstrated | |
| Administrative events are logged | Somebody is given reach | undemonstrated | |
| Administrative events are logged | Somebody signs in | demonstrated | server/test/a-sign-in-leaves-a-line.test.ts |
| Administrative events are logged | Somebody is refused a customer | undemonstrated | |
| Administrative events are logged | An administrator attempts to pause the record | undemonstrated | |
| Administrative events are logged | A change cannot be recorded | undemonstrated | |
| Administrative events are logged | A refusal cannot be recorded | undemonstrated | |
| Administrative events are logged | A sign-in cannot be recorded | undemonstrated | |
| Administrative events are logged | An entry is edited | demonstrated | server/src/install-activity/record.test.ts |
| Administrative events are logged | The record is read | demonstrated | server/src/install-audit/read.test.ts |
| Administrative events are logged | Where the record goes is changed | undemonstrated | |

## analysis

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| Every view is derived from the case, and none of them is a second record | A row is edited | undemonstrated | |
| Every view is derived from the case, and none of them is a second record | An analyst is asked to maintain a view | undemonstrated | |
| Where an attack had got to is derived from what the analyst already recorded | An analyst records what an attacker did | demonstrated | server/src/domain/killchain.test.ts |
| Where an attack had got to is derived from what the analyst already recorded | A more specific reading is available | demonstrated | server/src/domain/killchain.test.ts |
| Where an attack had got to is derived from what the analyst already recorded | An analyst disagrees with the derivation | demonstrated | server/src/domain/killchain.test.ts |
| Where an attack had got to is derived from what the analyst already recorded | A stage nothing implies | demonstrated | server/src/domain/killchain.test.ts |
| The picture is of the intrusion, not of the case file | A case with many recorded events | demonstrated | ui/src/components/blocks/incident-graph.test.ts |
| The picture is of the intrusion, not of the case file | The analyst's own working-out | demonstrated | ui/src/components/blocks/methods-are-not-in-the-graph.test.ts |
| The picture is of the intrusion, not of the case file | An analyst removes something from the picture | demonstrated | ui/src/components/blocks/entity-graph.test.ts |
| The picture is of the intrusion, not of the case file | Something is referred to that is not there | demonstrated | ui/src/components/blocks/entity-graph.test.ts |
| A case can be narrowed to a stretch of time, and the narrowing is a view | An analyst narrows a case to a stretch of time | demonstrated | ui/src/lib/time-window.test.ts |
| A case can be narrowed to a stretch of time, and the narrowing is a view | The narrowing is removed | demonstrated | ui/src/lib/time-window.test.ts |
| A value can be found anywhere in the case | An analyst searches for a value | demonstrated | ui/src/lib/case-search.test.ts |
| A value can be found anywhere in the case | The value appears in another case | undemonstrated | |

## case-archive

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| An archive is one file holding the whole case | A case is archived | demonstrated | server/src/case-archive/round-trip.test.ts |
| An archive is one file holding the whole case | An analyst archives without the attachments | demonstrated | server/src/case-archive/round-trip.test.ts |
| An archive is one file holding the whole case | Expected material is not found | undemonstrated | |
| An archive says what it should contain, and is checked against it | An archive is read | demonstrated | server/src/archive/format.test.ts |
| An archive says what it should contain, and is checked against it | An archive has been altered | demonstrated | server/src/archive/format.test.ts |
| An analyst can seal an archive, and the seal is theirs to hold | An analyst seals an archive | demonstrated | server/src/archive/envelope.test.ts |
| An analyst can seal an archive, and the seal is theirs to hold | The install is asked to open a sealed archive | undemonstrated | |
| An analyst can seal an archive, and the seal is theirs to hold | A secret too weak to be worth having | demonstrated | server/src/archive/envelope.test.ts |
| Reading an archive cannot be made to cost more than the install will spend | An archive declares more work than the install produces | demonstrated | server/src/archive/envelope.test.ts |
| Reading an archive cannot be made to cost more than the install will spend | An archive describing more content than the install accepts | demonstrated | server/src/archive/format.test.ts |
| Reading an archive creates a case; it never overwrites one | An archive is read in | demonstrated | server/src/case-archive/round-trip.test.ts |
| Reading an archive creates a case; it never overwrites one | An archive names things the install already holds | demonstrated | server/src/case-archive/round-trip.test.ts |
| Reading an archive creates a case; it never overwrites one | An archive is attributed | demonstrated | server/src/case-archive/round-trip.test.ts |

## cases

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| A case is identified by what an analyst recognises it by | A reference is reused within a customer | undemonstrated | |
| A case is identified by what an analyst recognises it by | The same reference is used for two customers | undemonstrated | |
| A case is identified by what an analyst recognises it by | A case moves to a customer that already uses its reference | undemonstrated | |
| A case is identified by what an analyst recognises it by | Several cases for one customer have no reference | undemonstrated | |
| A case is identified by what an analyst recognises it by | A case gains its reference later | undemonstrated | |
| A case says where its work sits | An analyst scans the case list | undemonstrated | |
| A case says where its work sits | The incident ends before the case does | undemonstrated | |
| A case says where its work sits | A case is closed with reporting outstanding | undemonstrated | |
| A case says where its work sits | A case owes nothing | undemonstrated | |
| A case says where its work sits | A handled incident resumes | undemonstrated | |
| A case's destruction is itself a record | An analyst deletes a case | demonstrated | server/test/a-deletion-outlives-its-case.test.ts |
| A case's destruction is itself a record | The install is asked what happened to a case | demonstrated | server/test/a-deletion-outlives-its-case.test.ts |
| A case's destruction is itself a record | A demonstration case is removed | demonstrated | server/test/a-deletion-outlives-its-case.test.ts |
| Reaching a case is decided in one place, by customer | An analyst reaches a case for a customer they hold | undemonstrated | |
| Reaching a case is decided in one place, by customer | An analyst reaches a case for a customer they do not hold | undemonstrated | |
| Reaching a case is decided in one place, by customer | An unknown customer becomes known | undemonstrated | |
| Reaching a case is decided in one place, by customer | A case's customer changes under an analyst | undemonstrated | |
| Reaching a case is decided in one place, by customer | A case is opened before the customer is known | undemonstrated | |
| Demonstration content is distinguishable from real work | An install carries both | undemonstrated | |
| Demonstration content is distinguishable from real work | A count is taken across cases | undemonstrated | |
| An analyst can return to recent work | An analyst returns after closing the application | demonstrated | server/src/recent/recent.service.test.ts |
| An analyst can return to recent work | Recent work names a case that has gone | demonstrated | server/src/recent/recent.service.test.ts |

## collections

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| One implementation, and what differs is described rather than coded | A collection is added | demonstrated | server/src/collections/registry.test.ts |
| One implementation, and what differs is described rather than coded | A collection needs behaviour the others do not have | undemonstrated | |
| A row is checked against its description, where the caller cannot reach | A caller submits a row the screen would not have | undemonstrated | |
| A row is checked against its description, where the caller cannot reach | A field draws from a vocabulary | demonstrated | server/src/exports/import.service.test.ts |
| A row is checked against its description, where the caller cannot reach | Fields disagree with each other | demonstrated | server/src/domain/field-spec.test.ts |
| The description is retrievable, so what a case may hold is answerable from the application | An analyst asks what a field accepts | demonstrated | server/src/specs/specs.controller.test.ts |
| The description is retrievable, so what a case may hold is answerable from the application | A field is added | undemonstrated | |
| The description is retrievable, so what a case may hold is answerable from the application | An install has been extended | undemonstrated | |
| Every write is attributed, checked and announced as one act | Two analysts write to one row | demonstrated | server/src/db/mutate.test.ts |
| Every write is attributed, checked and announced as one act | A write succeeds | demonstrated | server/src/db/mutate.test.ts |
| A reference points inside its own case, and the store alone cannot enforce it | A row references another case's row | demonstrated | server/src/collections/reference-check.test.ts |
| A reference points inside its own case, and the store alone cannot enforce it | A reference is added to what a row is | demonstrated | server/src/collections/method-references.test.ts |
| A reference points inside its own case, and the store alone cannot enforce it | A referenced row is removed | demonstrated | server/src/collections/method-references.test.ts |
| Only some collections have an identity, and the rest are events | The same host is imported twice | demonstrated | server/src/exports/import.service.test.ts |
| Only some collections have an identity, and the rest are events | The same timeline entry is imported twice | undemonstrated | |
| Only some collections have an identity, and the rest are events | A second way of creating rows is added | demonstrated | server/src/collections/identity.test.ts |
| Doing something to many rows obeys every rule that governs one | Some rows in a bulk write have moved | demonstrated | server/src/collections/bulk.test.ts |
| Doing something to many rows obeys every rule that governs one | A bulk write crosses the case boundary | demonstrated | server/src/collections/bulk.test.ts |
| Order an analyst chose is theirs, and is not a property of the data | An analyst reorders rows | demonstrated | server/src/collections/order-survives.test.ts |
| Order an analyst chose is theirs, and is not a property of the data | Rows arrive from an import | demonstrated | server/src/collections/order-survives.test.ts |
| What comes in and goes out is the same description | An analyst previews an import | demonstrated | server/test/incident-import.test.ts |
| What comes in and goes out is the same description | A row in an import is malformed | demonstrated | server/src/exports/import.service.test.ts |
| What comes in and goes out is the same description | An export is imported back | demonstrated | server/src/exports/csv-import.test.ts |

## compliance

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| The answer has three values, and not knowing is one of them | A case records nothing yet | demonstrated | server/src/compliance/lenses.test.ts |
| The answer has three values, and not knowing is one of them | A fact is recorded that settles it | demonstrated | server/src/compliance/lenses.test.ts |
| The answer has three values, and not knowing is one of them | A fact is recorded that does not settle it | demonstrated | server/src/compliance/lenses.test.ts |
| An assessment shows its working, against the instrument | An assessment is read | demonstrated | server/src/compliance/an-assessment-shows-its-working.test.ts |
| An assessment shows its working, against the instrument | A criterion is unstated | demonstrated | server/src/compliance/lenses.test.ts |
| A threshold is quoted, never chosen | A threshold is applied | demonstrated | server/src/compliance/lenses.test.ts |
| A threshold is quoted, never chosen | Thresholds differ by kind of organisation | demonstrated | server/src/compliance/lenses.test.ts |
| A threshold is quoted, never chosen | A quoted figure drifts from its source | demonstrated | server/src/compliance/oj.test.ts |
| The application assesses; the organisation reports | An assessment finds a notification is owed | demonstrated | server/src/compliance/the-organisation-reports.test.ts |
| The application assesses; the organisation reports | A notification was made | demonstrated | server/src/compliance/the-organisation-reports.test.ts |
| A regime that does not apply is not assessed | A customer is outside a regime | undemonstrated | |
| A regime that does not apply is not assessed | A case moves to a customer under different regimes | undemonstrated | |
| A regime that does not apply is not assessed | The analyst adopts the new customer's regimes | undemonstrated | |
| A regime that does not apply is not assessed | A regime is added by a move | undemonstrated | |
| Reporting stage is tracked against the case, not as its condition | A first submission is made and a later one is owed | undemonstrated | |
| Reporting stage is tracked against the case, not as its condition | A deadline approaches | undemonstrated | |
| Reporting stage is tracked against the case, not as its condition | The case is closed with a submission outstanding | undemonstrated | |
| An assessment is a reading of the case at a moment, and it moves | A fact changes after an assessment was read | demonstrated | server/src/compliance/an-assessment-moves.test.ts |
| An assessment is a reading of the case at a moment, and it moves | An assessment is quoted in a report | undemonstrated | |

## customers

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| A customer is a record the system holds | A customer is renamed | demonstrated | server/src/customers/customers.service.test.ts |
| A customer is a record the system holds | An install has no customers | undemonstrated | |
| A customer holds what compliance asks about the organisation | A regime does not apply to a customer | undemonstrated | |
| A customer holds what compliance asks about the organisation | An organisation fact is asked for at case level | demonstrated | server/src/customers/a-case-takes-a-copy.test.ts |
| A case takes a copy, and is told when the original moves | A customer's details are corrected | demonstrated | server/src/customers/a-case-takes-a-copy.test.ts |
| A case takes a copy, and is told when the original moves | An analyst accepts a correction | demonstrated | server/src/customers/a-case-takes-a-copy.test.ts |
| A case takes a copy, and is told when the original moves | A closed case is left alone | demonstrated | server/src/customers/a-case-takes-a-copy.test.ts |
| A case may answer for an organisation the system does not hold | An organisation is answered for on the case | demonstrated | server/src/customers/a-case-answers-for-itself.test.ts |
| A case may answer for an organisation the system does not hold | The organisation is onboarded afterwards | demonstrated | server/src/customers/a-case-answers-for-itself.test.ts |
| A customer cannot be removed out from under its cases | A customer with cases is removed | demonstrated | server/src/customers/two-customers-are-one.test.ts |
| A customer cannot be removed out from under its cases | Two customer records turn out to be one organisation | demonstrated | server/src/customers/two-customers-are-one.test.ts |
| A customer cannot be removed out from under its cases | The merged records disagree | demonstrated | server/src/customers/two-customers-are-one.test.ts |
| A customer cannot be removed out from under its cases | Reach after a merge | demonstrated | server/src/customers/a-merge-moves-the-reach.test.ts |
| A customer cannot be removed out from under its cases | An analyst reaches both sides of a merge at different levels | demonstrated | server/src/customers/a-merge-moves-the-reach.test.ts |
| A customer cannot be removed out from under its cases | A reference collides across the merge | demonstrated | server/src/customers/two-customers-are-one.test.ts |
| A customer cannot be removed out from under its cases | The default customer is merged | demonstrated | server/src/customers/two-customers-are-one.test.ts |

## data-exchange

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| What the application writes, it can read back | An export is imported unchanged | demonstrated | server/src/exports/import.service.test.ts |
| What the application writes, it can read back | A file names a field that does not exist | demonstrated | server/src/exports/csv-import.test.ts |
| What the application writes, it can read back | A blank value | undemonstrated | |
| An import is all of it or none of it | One row in a file is invalid | demonstrated | server/src/exports/import.service.test.ts |
| An import is all of it or none of it | An import succeeds | demonstrated | server/src/exports/import.service.test.ts |
| A reference travels as what it points at, not as where it was kept | A file is imported back into the case it came from | undemonstrated | |
| A reference travels as what it points at, not as where it was kept | A file is imported into another case holding the same thing | undemonstrated | |
| A reference travels as what it points at, not as where it was kept | A file names where a row was kept | undemonstrated | |
| A reference the destination cannot resolve is reported, never dropped in silence | The destination does not hold the referenced thing | demonstrated | server/src/exports/import.service.test.ts |
| A reference the destination cannot resolve is reported, never dropped in silence | An import that carried everything | demonstrated | server/src/exports/import.service.test.ts |
| An import says what to do about something already there | The analyst does not say what to do | demonstrated | server/src/exports/import.service.test.ts |
| An import says what to do about something already there | A row was changed by somebody else | demonstrated | server/src/exports/import.service.test.ts |
| An import says what to do about something already there | An unrecognised instruction | demonstrated | server/src/exports/exports.controller.test.ts |
| What leaves the application cannot execute in what opens it | A value begins as a formula | demonstrated | server/src/exports/csv.test.ts |
| What leaves the application cannot execute in what opens it | A file that has already been through a spreadsheet | undemonstrated |  |
| Content that hides what it says is refused before it is stored | A value carries characters that cannot be seen | demonstrated | server/src/exports/method-cells.test.ts |
| A file has a size the application will accept, and says so when it will not | A file is too large | demonstrated | server/src/exports/csv-import.test.ts |
| An indicator feed is what a defender can act on | An indicator is recorded as harmless | demonstrated | server/src/exports/indicators.test.ts |
| An indicator feed is what a defender can act on | A disposition the application does not recognise | demonstrated | server/src/exports/indicators.test.ts |
| An indicator feed is what a defender can act on | A feed is published for sharing | demonstrated | server/src/exports/indicators.test.ts |
| An indicator feed is what a defender can act on | A restriction is named for a form that cannot carry one | demonstrated | server/src/exports/exports.controller.test.ts |

## deployment

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| It comes up with one command and no preparation | A first start on a clean machine | demonstrated | tests/docker/test_container_runtime.py |
| It comes up with one command and no preparation | A second start | undemonstrated | |
| It comes up with one command and no preparation | A dependency is slow | undemonstrated | |
| There is one way in, and it is the only thing exposed | What an install exposes | undemonstrated | |
| There is one way in, and it is the only thing exposed | The application is addressed directly | undemonstrated | |
| There is one way in, and it is the only thing exposed | An operator wants it reachable from the network | undemonstrated | |
| The connection is protected, and there is no way to turn that off | An install has no certificate | demonstrated | tests/docker/test_container_runtime.py |
| The connection is protected, and there is no way to turn that off | The operator supplies a certificate | undemonstrated | |
| The connection is protected, and there is no way to turn that off | A supplied certificate cannot be used | undemonstrated | |
| The connection is protected, and there is no way to turn that off | Somebody wants it unprotected | undemonstrated | |
| Setting up is separate from running, and runs once | Preparation runs before serving | demonstrated | tests/docker/test_container_runtime.py |
| Setting up is separate from running, and runs once | An install is started again | undemonstrated | |
| Setting up is separate from running, and runs once | Preparation fails | undemonstrated | |
| What must survive is named, and what must not is not | The install is rebuilt | undemonstrated | |
| What must survive is named, and what must not is not | Something not named is lost | undemonstrated | |
| An install can say whether it is well, and what is wrong | A component has started but cannot answer | demonstrated | server/src/health/dependencies.health.test.ts |
| An install can say whether it is well, and what is wrong | A dependency fails while running | demonstrated | server/src/health/dependencies.health.test.ts |
| The application runs with no more than it needs | The application attempts something outside its work | undemonstrated | |
| The application runs with no more than it needs | A part is examined for what it can do | undemonstrated | |

## incident-import

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| The install reaches nobody's platform on its own account | An install with no connection configured | undemonstrated | |
| The install reaches nobody's platform on its own account | The analyst's credential is used, not the install's | undemonstrated | |
| The install reaches nobody's platform on its own account | A credential is not kept | undemonstrated | |
| The install reaches nobody's platform on its own account | A credential goes only where it was issued for | demonstrated | ui/src/api/sentinel/armSource.test.ts |
| Nothing is written until an analyst has approved it | An import is previewed | demonstrated | server/test/incident-import.test.ts |
| Nothing is written until an analyst has approved it | An analyst declines part of an import | undemonstrated | |
| Nothing is written until an analyst has approved it | An analyst corrects a value before it is written | demonstrated | server/src/incident-import/edits.test.ts |
| Nothing is written until an analyst has approved it | A correction the description would refuse | undemonstrated | |
| An import is matched against what the case already holds | An imported thing is already in the case | undemonstrated | |
| An import is matched against what the case already holds | The case changed while the import was reviewed | undemonstrated | |
| An import is matched against what the case already holds | An event is imported twice | undemonstrated | |
| An imported row says that it was imported, and that nobody has read it | An imported row is read back | demonstrated | server/test/incident-import.test.ts |
| An imported row says that it was imported, and that nobody has read it | A platform's data claims to be something else | undemonstrated | |
| An imported row says that it was imported, and that nobody has read it | An analyst reviews an imported row | undemonstrated | |
| What could not be brought in is counted rather than dropped | The platform sends something unrecognised | demonstrated | server/test/incident-import.test.ts |
| What could not be brought in is counted rather than dropped | An analyst asks what was left behind | undemonstrated | |
| A failed import never leaves a case behind | An import asked to create a case fails | undemonstrated | |
| A failed import never leaves a case behind | An import asked to create a case succeeds | undemonstrated | |
| An import that failed partway can be run again without doing it twice | An import fails partway and is run again | undemonstrated | |
| An import that failed partway can be run again without doing it twice | A partly written import is reported | undemonstrated | |

## install-audit

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| The record's home is a destination the operator keeps, not this install | An install with a destination configured | undemonstrated | |
| The record's home is a destination the operator keeps, not this install | The destination cannot be reached | undemonstrated | |
| The record's home is a destination the operator keeps, not this install | An install with no destination configured | undemonstrated | |
| A line, once written, cannot be changed | An attempt to change a line | demonstrated | server/src/install-activity/record.test.ts |
| A line, once written, cannot be changed | A line claiming another time | demonstrated | server/src/install-activity/prune.test.ts |
| What the install holds is a buffer, and letting it go is not deleting the record | A delivered line ages out of the install | undemonstrated | |
| What the install holds is a buffer, and letting it go is not deleting the record | The destination has been unreachable | undemonstrated | |
| What the install holds is a buffer, and letting it go is not deleting the record | An install that is the record lets a line go | demonstrated | server/src/install-activity/prune.test.ts |
| What the install holds is a buffer, and letting it go is not deleting the record | An administrator wants a line gone | demonstrated | server/src/install-activity/record.test.ts |
| What the install holds is a buffer, and letting it go is not deleting the record | A window below the floor, on an install that is the record | demonstrated | server/src/install-activity/prune.test.ts |
| What the install holds is a buffer, and letting it go is not deleting the record | No window declared, on an install that is the record | demonstrated | server/src/install-activity/prune.test.ts |
| What is kept for a long time and what is kept briefly are separated | A line is written | demonstrated | server/src/install-activity/retention-class.test.ts |
| What is kept for a long time and what is kept briefly are separated | The two windows differ | demonstrated | server/src/install-activity/prune.test.ts |
| A line says who, what, and to what, and never says what was written | An account is removed after acting | demonstrated | server/src/install-activity/record.test.ts |
| A line says who, what, and to what, and never says what was written | A request carrying a password | demonstrated | server/src/install-activity/audit.interceptor.test.ts |
| A line says who, what, and to what, and never says what was written | A caller asserts their own address | demonstrated | server/src/install-activity/record.test.ts |
| A line says who, what, and to what, and never says what was written | A caller invents a route | demonstrated | server/src/install-activity/audit.interceptor.test.ts |
| Refusals are recorded, and a run of them is louder than one | A sign-in fails | demonstrated | server/src/install-activity/record.test.ts |
| Refusals are recorded, and a run of them is louder than one | One failure and a run of them | demonstrated | server/src/install-audit/read.test.ts |
| Refusals are recorded, and a run of them is louder than one | A stored seriousness is not lowered | demonstrated | server/src/install-audit/read.test.ts |
| Changing what the audit keeps is itself audited, and loudly | The retention window is shortened | demonstrated | server/src/install-activity/setting-severity.test.ts |
| Reading the audit is an act the audit records | An administrator reads the audit | demonstrated | server/src/install-audit/read.test.ts |
| Reading the audit is an act the audit records | An analyst who is not an administrator | demonstrated | server/test/analyst-privilege.test.ts |
| Reading the audit is an act the audit records | An administrator pages through the audit | demonstrated | server/src/install-audit/read.test.ts |
| The record is readable by the monitoring the organisation already runs | The audit is read by an external system | undemonstrated | |
| The record is readable by the monitoring the organisation already runs | An install is upgraded | undemonstrated | |

## interface

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| The interface is layers, and each knows only what is beneath it | A control needs something from this application | demonstrated | ui/src/components/ui/kit-is-publishable.rule.test.ts |
| The interface is layers, and each knows only what is beneath it | A screen needs data | demonstrated | ui/src/screens/screens-never-fetch.rule.test.ts |
| The interface is layers, and each knows only what is beneath it | A layer reaches upward | demonstrated | ui/src/components/blocks/tiers.rule.test.ts |
| Controls come from one place, and nothing above it builds its own | A screen needs a control that does not exist | demonstrated | ui/src/components/ui/kit-owns-the-primitives.rule.test.ts |
| Controls come from one place, and nothing above it builds its own | Somebody reaches for a primitive directly | demonstrated | ui/src/components/ui/kit-owns-the-primitives.rule.test.ts |
| Controls come from one place, and nothing above it builds its own | A second version of an existing control appears | demonstrated | ui/src/one-implementation.rule.test.ts |
| Accessibility is why the controls layer exists | The interface is used without a pointer | undemonstrated | |
| Accessibility is why the controls layer exists | Something looks like a button and navigates | undemonstrated | |
| Accessibility is why the controls layer exists | Focus moves into a layer over the screen | undemonstrated | |
| A screen draws; it does not fetch, and it does not place itself | A screen is shown in an unusual state | demonstrated | ui/src/screens/screens-never-fetch.rule.test.ts |
| A screen draws; it does not fetch, and it does not place itself | A screen is placed somewhere else | undemonstrated | |
| Every part can be seen on its own, in the states that matter | A part that presents data is shown in isolation | undemonstrated | |
| Every part can be seen on its own, in the states that matter | A part that presents no data is shown in isolation | undemonstrated | |
| Every part can be seen on its own, in the states that matter | A part is given nothing | undemonstrated | |
| The interface has one vocabulary, and it is not invented per screen | A screen needs a value the set does not have | demonstrated | ui/src/motion-scale.rule.test.ts |
| The interface has one vocabulary, and it is not invented per screen | A name does not resolve | demonstrated | ui/src/styles/every-name-resolves.rule.test.ts |
| The interface has one vocabulary, and it is not invented per screen | An analyst has asked for less motion | undemonstrated | |
| What two screens both need is derived once | Two screens show the same derived answer | demonstrated | ui/src/lib/shared-derivations.rule.test.ts |
| What two screens both need is derived once | A derivation needs to know its caller | demonstrated | ui/src/lib/lib-is-shared-and-therefore-pure.rule.test.ts |

## library

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| An install starts with useful content, and it is recognisable as the application's | A newly installed system | demonstrated | server/src/library/library.controller.test.ts |
| An install starts with useful content, and it is recognisable as the application's | An analyst chooses between entries | undemonstrated | |
| What ships is not edited, and disagreeing with it is done by copying it | An operator edits a shipped entry | undemonstrated | |
| What ships is not edited, and disagreeing with it is done by copying it | An operator wants a shipped entry to differ | undemonstrated | |
| What ships is not edited, and disagreeing with it is done by copying it | A local entry takes a shipped entry's name | demonstrated | server/src/library/library.disabled.test.ts |
| Every kind of library content can be authored, not only chosen | An operator writes a new entry of any kind | undemonstrated | |
| Every kind of library content can be authored, not only chosen | An operator arranges a report their own way | undemonstrated | |
| An operator can withdraw what ships without deleting it | An operator withdraws a shipped entry | demonstrated | server/src/library/library.disabled.test.ts |
| An operator can withdraw what ships without deleting it | A withdrawal is reversed | demonstrated | server/src/library/library.disabled.test.ts |
| An install can be given its library as a document, and can read it back | An operator exports a library | demonstrated | server/test/library-as-code.test.ts |
| An install can be given its library as a document, and can read it back | A document with one bad entry is written back | undemonstrated | |
| Content only makes sense where the install has the thing it is for | A layout for a regime the install does not assess | undemonstrated | |

## live

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| A connection is admitted by its own checks, and their absence is silent | A connection is opened from another site | demonstrated | server/test/live-socket.test.ts |
| A connection is admitted by its own checks, and their absence is silent | A connection names a case the session does not reach | demonstrated | server/src/live/the-socket-refuses-observably.test.ts |
| A connection is admitted by its own checks, and their absence is silent | A held account connects | demonstrated | server/src/live/live.gateway.test.ts |
| A connection is admitted by its own checks, and their absence is silent | A check is removed | demonstrated | server/src/live/the-socket-refuses-observably.test.ts |
| Presence says who is here now, and stops saying it by itself | An analyst joins | demonstrated | server/test/live-socket.test.ts |
| Presence says who is here now, and stops saying it by itself | A connection is lost without warning | undemonstrated | |
| Presence says who is here now, and stops saying it by itself | An analyst is in two places | demonstrated | server/src/live/presence.store.test.ts |
| A claim warns; it does not lock | An analyst claims an entry | demonstrated | server/src/live/case-channel.service.test.ts |
| A claim warns; it does not lock | Two analysts claim the same entry | demonstrated | server/src/live/presence.store.test.ts |
| A claim warns; it does not lock | A holder disappears | demonstrated | server/src/live/presence.store.test.ts |
| A claim warns; it does not lock | Somebody writes to a claimed entry | demonstrated | server/src/live/a-claim-is-not-a-lock.test.ts |
| A change reaches every open screen, and says only what changed | Another analyst writes | demonstrated | server/test/change-feed-wiring.test.ts |
| A change reaches every open screen, and says only what changed | What travels over the connection | demonstrated | server/src/live/case-channel.service.test.ts |
| A change reaches every open screen, and says only what changed | A screen re-reads after an announcement | demonstrated | ui/src/api/every-consumer-re-announces.test.ts |
| Written prose is edited together, not saved over | Two analysts write in one section | demonstrated | ui/src/api/proseSync.test.ts |
| Written prose is edited together, not saved over | An analyst writes while disconnected | demonstrated | ui/src/api/proseSync.test.ts |
| A reconnection catches up rather than starts over | A connection drops briefly | demonstrated | ui/src/api/a-reconnect-re-reads-the-case.test.tsx |
| A reconnection catches up rather than starts over | The gap is too large to fill | undemonstrated | |
| The connection dies with the reach that admitted it | Reach is withdrawn mid-session | demonstrated | server/test/live-socket.test.ts |
| The connection dies with the reach that admitted it | The case is deleted underneath a connection | demonstrated | server/test/live-socket.test.ts |

## preferences

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| An analyst's own settings are theirs and reach nobody else | An analyst has chosen nothing | demonstrated | server/src/preferences/preferences.service.test.ts |
| An analyst's own settings are theirs and reach nobody else | An analyst changes a setting | demonstrated | server/src/preferences/preferences.service.test.ts |
| An analyst's own settings are theirs and reach nobody else | A setting the application does not offer | undemonstrated | |
| How an analyst is represented is theirs, and only that is shared | A colleague is drawn on a case | demonstrated | server/src/preferences/preferences.service.test.ts |
| An image an analyst supplies is never the image the application serves | An analyst supplies an image | demonstrated | server/src/preferences/preferences.controller.test.ts |
| An image an analyst supplies is never the image the application serves | The bytes are not what the sender says | demonstrated | server/src/preferences/preferences.controller.test.ts |
| An image an analyst supplies is never the image the application serves | A format that can carry a program | demonstrated | server/src/preferences/avatar-image.test.ts |
| An image an analyst supplies is never the image the application serves | Material carried alongside the picture | undemonstrated | |
| An upload is bounded before it is read, and a refusal says nothing useful to a sender | An upload larger than the install accepts | demonstrated | server/src/preferences/preferences.controller.test.ts |
| An upload is bounded before it is read, and a refusal says nothing useful to a sender | A small file describing an enormous image | demonstrated | server/src/preferences/preferences.controller.test.ts |
| An upload is bounded before it is read, and a refusal says nothing useful to a sender | Two uploads fail for different reasons | undemonstrated | |
| The application's own marks are readable before anybody has signed in | A browser opens the application | undemonstrated | |
| The application's own marks are readable before anybody has signed in | The marks are read for what they disclose | undemonstrated | |
| What an install decides is a closed set, and changing one is an administrative act | An operator sets something the install does not recognise | demonstrated | server/src/preferences/install.service.test.ts |
| What an install decides is a closed set, and changing one is an administrative act | An analyst who is not an administrator changes an install setting | undemonstrated | |
| What an install decides is a closed set, and changing one is an administrative act | An install setting is changed | undemonstrated | |

## reference

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| It is generated, and cannot disagree with what it describes | A field is added | demonstrated | server/src/domain/field-spec.test.ts |
| It is generated, and cannot disagree with what it describes | A vocabulary changes | undemonstrated | |
| It is generated, and cannot disagree with what it describes | Something is not derivable | undemonstrated | |
| It answers the question an analyst has while working | An analyst does not know what a field wants | demonstrated | server/src/domain/field-spec.test.ts |
| It answers the question an analyst has while working | The application is used in another language | undemonstrated | |
| It says what it does not cover | Somebody asks whether the application does something | undemonstrated | |
| The open door describes the product and nothing else | Somebody with no account asks what the product holds | undemonstrated | |
| The open door describes the product and nothing else | Two installs of one version are asked | undemonstrated | |
| The open door describes the product and nothing else | An install has been extended | undemonstrated | |
| The door behind a session describes this install | An analyst reads what their install holds | undemonstrated | |
| The door behind a session describes this install | The permission is withdrawn | undemonstrated | |
| The door behind a session describes this install | An account is created | undemonstrated | |
| Configuration naming a customer is scoped to that customer | Configuration is added for one customer | undemonstrated | |
| Configuration naming a customer is scoped to that customer | An analyst reads the reference | undemonstrated | |
| Configuration naming a customer is scoped to that customer | A customer is named in shared configuration | undemonstrated | |
| Configuration naming a customer is scoped to that customer | The reference is read by two analysts | undemonstrated | |

## report

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| A report is assembled from the case, not transcribed from it | The case changes under a draft report | undemonstrated | |
| A report is assembled from the case, not transcribed from it | An analyst writes an assessment | undemonstrated | |
| A sent report is frozen, and the freeze is one rule | A sent report is edited | demonstrated | server/src/report/freeze.test.ts |
| A sent report is frozen, and the freeze is one rule | A part is moved into a sent report | demonstrated | server/src/report/freeze.test.ts |
| A sent report is frozen, and the freeze is one rule | A new way to write a part is added | demonstrated | server/src/report/freeze.test.ts |
| Sending stamps and preserves in one act | A report is sent | demonstrated | server/src/report/lifecycle.service.test.ts |
| Sending stamps and preserves in one act | The document cannot be produced | undemonstrated | |
| Sending stamps and preserves in one act | The case changes after sending | demonstrated | server/src/report/lifecycle.service.test.ts |
| A correction is a new report, not an edit | A sent report is wrong | demonstrated | server/src/report/lifecycle.service.test.ts |
| A correction is a new report, not an edit | Two corrections race | undemonstrated | |
| The destination decides what a part may be | A report is exported | undemonstrated | |
| The destination decides what a part may be | A part cannot be drawn by a format | demonstrated | server/src/report/document/figure.test.ts |
| A report says what is missing before it is sent | A report is checked before sending | demonstrated | server/src/report/lifecycle.service.test.ts |
| A report says what is missing before it is sent | A section was removed and is wanted back | demonstrated | server/src/report/lifecycle.service.test.ts |
| The application's own words are in the report's language; the analyst's are the analyst's | A report is produced in a second language | undemonstrated | |
| The application's own words are in the report's language; the analyst's are the analyst's | Written prose is in another language | undemonstrated | |
| The application's own words are in the report's language; the analyst's are the analyst's | The analyst meant it | undemonstrated | |
| A report is for an audience, and the audience decides what it owes | A report is created | undemonstrated | |
| A report is for an audience, and the audience decides what it owes | A layout omits something the audience requires | undemonstrated | |
| A report never carries another customer's data | A report carries a row from another customer | undemonstrated | |
| A report never carries another customer's data | The offending part is removed | undemonstrated | |
| Material an audience does not expect is named, and the analyst decides | An internal note is in a customer report | undemonstrated | |
| Material an audience does not expect is named, and the analyst decides | The analyst sends it anyway | undemonstrated | |

## state

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| What may be lost and what may not are separated by design | The ephemeral store is emptied | undemonstrated | |
| What may be lost and what may not are separated by design | The ephemeral store is unavailable at start | undemonstrated | |
| What may be lost and what may not are separated by design | A durable write is attempted while the ephemeral store is down | undemonstrated | |
| The application cannot reach a row it should not, even by mistake | A query forgets its boundary | demonstrated | server/src/db/scope.test.ts |
| The application cannot reach a row it should not, even by mistake | The application attempts to widen its own reach | undemonstrated | |
| The application cannot reach a row it should not, even by mistake | A new table holding case data is added | undemonstrated | |
| Changing the shape of the store is a separate power | The application attempts to change the schema | demonstrated | server/src/db/scope.test.ts |
| Changing the shape of the store is a separate power | A schema change is applied | demonstrated | server/src/db/policy-push.test.ts |
| A version is what a write is checked against, and it lives with the row | A write and its record are one act | demonstrated | server/src/db/mutate.test.ts |
| A version is what a write is checked against, and it lives with the row | A write arrives against a version that has moved | demonstrated | server/src/db/mutate.test.ts |
| The store is not migrated while the shape is still moving | Data from an older shape is presented | undemonstrated | |
| What is kept forever is decided, not defaulted | A record reaches the end of its life | undemonstrated | |
| What is kept forever is decided, not defaulted | A retention period is shortened below an obligation | undemonstrated | |
| Evidence is wrapped, and the wrapping is containment rather than confidentiality | Evidence is stored | demonstrated | server/src/evidence/store.test.ts |
| Evidence is wrapped, and the wrapping is containment rather than confidentiality | The same artefact arrives twice | demonstrated | server/src/evidence/store.test.ts |
| Evidence is wrapped, and the wrapping is containment rather than confidentiality | Evidence is downloaded | demonstrated | server/src/collections/evidence-file.write.test.ts |
| Evidence is wrapped, and the wrapping is containment rather than confidentiality | Somebody treats the wrapping as protection | undemonstrated | |
| What is stored can be recovered, and the recovery is proven | An install is restored from a copy | undemonstrated | |
| What is stored can be recovered, and the recovery is proven | Only the database was restored | undemonstrated | |
| What is stored can be recovered, and the recovery is proven | A case is opened with its evidence missing | demonstrated | server/src/collections/evidence-file.write.test.ts |
| What is stored can be recovered, and the recovery is proven | The artefacts are restored afterwards | undemonstrated | |

## the-api

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| The interface is the product, and the screens are a consumer | A screen does something no caller can | undemonstrated | |
| The interface is the product, and the screens are a consumer | A rule is enforced only in the client | demonstrated | server/test/the-interface-refuses-it-too.test.ts |
| A caller asks for what it needs and receives no more | A screen needs a handful of fields | undemonstrated | |
| A caller asks for what it needs and receives no more | A record grows a field | undemonstrated | |
| A caller asks for what it needs and receives no more | A caller wants everything | demonstrated | server/test/openapi-contract.test.ts |
| Reach is enforced where the data is, not where the request arrives | A caller composes a request nobody anticipated | demonstrated | server/src/db/the-store-refuses-an-unscoped-read.test.ts |
| Reach is enforced where the data is, not where the request arrives | A new way to read a record is added | demonstrated | server/src/db/the-store-refuses-an-unscoped-read.test.ts |
| A read tells a caller what it is looking at | A caller reads and later writes | demonstrated | server/test/openapi-contract.test.ts |
| A read tells a caller what it is looking at | Somebody wrote first | demonstrated | server/src/collections/a-refused-write-says-what-the-row-became.test.ts |
| The interface describes itself, and the description is generated | A route is added | demonstrated | server/test/openapi-contract.test.ts |
| The interface describes itself, and the description is generated | A route changes shape | undemonstrated | |
| A refusal says which of the caller's problems it is | A caller asks for something out of reach | demonstrated | server/test/not-there-and-not-yours-look-alike.test.ts |
| A refusal says which of the caller's problems it is | A caller sends a body the interface cannot accept | demonstrated | server/test/malformed-requests.test.ts |
| What a request costs is bounded before it runs | A caller asks for too much at once | demonstrated | server/src/exports/the-import-cap-fires-before-the-body-is-read.test.ts |
| What a request costs is bounded before it runs | A caller asks too often | undemonstrated | |
| A fact can be asked for across cases | An indicator is asked about across cases | undemonstrated | |
| A fact can be asked for across cases | A question spans a boundary | undemonstrated | |
| The description is valid against the version it declares | A schema uses a keyword the declared version has no spelling for | demonstrated | server/test/openapi-document.test.ts |
| The description is valid against the version it declares | The generator's dialect moves | demonstrated | server/test/openapi-document.test.ts |
| The description is valid against the version it declares | A caller generates a client | undemonstrated | |

## transport

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| The browser is told what the application may do, on every response | A response is read by a browser | demonstrated | server/test/security-headers.test.ts |
| The browser is told what the application may do, on every response | The policy is read for what it permits | demonstrated | server/test/security-headers.test.ts |
| The browser is told what the application may do, on every response | The browser must reach the analyst's identity provider | demonstrated | server/test/security-headers.test.ts |
| The application refuses to be framed | A page tries to embed the application | demonstrated | server/test/security-headers.test.ts |
| Case data is not left on the analyst's disk | An analyst reads a case and signs out | demonstrated | server/test/security-headers.test.ts |
| Case data is not left on the analyst's disk | An unchanging asset is served | demonstrated | server/test/security-headers.test.ts |
| An install reached at its own name tells the browser to keep it protected | An install reached at its own name | undemonstrated | |
| An install reached at its own name tells the browser to keep it protected | An analyst follows an unprotected link afterwards | undemonstrated | |
| An install reached at its own name tells the browser to keep it protected | An install reached at a loopback address | demonstrated | server/test/security-headers.test.ts |
| The application answers only to itself | The install is reached at a loopback address | demonstrated | server/src/auth/trusted-origins.test.ts |
| The application answers only to itself | The unprotected spelling of the install | demonstrated | server/src/auth/trusted-origins.test.ts |
| The application answers only to itself | Another port on the same host | demonstrated | server/src/auth/trusted-origins.test.ts |
| The application answers only to itself | The install cannot tell where it is | demonstrated | server/src/auth/trusted-origins.test.ts |
| A development convenience cannot exist in a running install | A running install | demonstrated | server/src/auth/trusted-origins.test.ts |
| A development convenience cannot exist in a running install | A development install with no port named | demonstrated | server/src/auth/trusted-origins.test.ts |
| A request for data is never answered with a page | A caller asks for a route the interface does not have | demonstrated | server/test/a-data-request-is-never-a-page.test.ts |
| A request for data is never answered with a page | An analyst reloads on a case | demonstrated | server/test/a-data-request-is-never-a-page.test.ts |
