# Compliance

## Purpose

Whether an incident is one somebody must be told about, under the regimes that apply to the customer it happened to.

The application answers that question against what the case records and shows its working. It does not file anything, does not decide on the analyst's behalf, and does not treat silence as an answer.

## Requirements

### Requirement: The answer has three values, and not knowing is one of them

An assessment MUST distinguish three outcomes: reportable, not reportable, and **not decidable on what the case records**. The third MUST NOT be presented as the second.

A case that has not yet recorded whether personal data was involved is not a case where personal data was not involved. Collapsing those two is how a notification deadline passes while a screen says nothing is owed.

Where an assessment is undecidable, what is missing MUST be nameable. "Not yet" is only useful with "because these facts are unstated".

#### Scenario: A case records nothing yet

- GIVEN a newly opened case
- WHEN it is assessed
- THEN each regime says the answer is not yet decidable
- AND none of them says nothing is owed

#### Scenario: A fact is recorded that settles it

- GIVEN an undecidable assessment
- WHEN the analyst records the fact it was waiting on
- THEN the assessment decides
- AND says which fact decided it

#### Scenario: A fact is recorded that does not settle it

- GIVEN an undecidable assessment waiting on several facts
- WHEN one of them is recorded
- THEN it remains undecidable
- AND names what is still outstanding

### Requirement: An assessment shows its working, against the instrument

An assessment MUST name the regime, the article it rests on, and every criterion it weighed. Each criterion MUST say whether it is met, unmet or unstated, and MUST name the provision it comes from.

An analyst MUST be able to see which criteria decided the outcome, distinct from those that were weighed and did not.

An assessment MUST NOT be a number, a colour or a score. The analyst is the one who will defend the decision to a regulator, and they can only defend a reading of the instrument.

#### Scenario: An assessment is read

- GIVEN a decided assessment
- WHEN an analyst opens it
- THEN it names the regime, the article, and every criterion
- AND says which of them decided the outcome

#### Scenario: A criterion is unstated

- GIVEN an assessment with a criterion nobody has answered
- WHEN it is read
- THEN that criterion is shown as unstated rather than as unmet

### Requirement: A threshold is quoted, never chosen

Every numeric threshold, duration and monetary figure MUST come from the instrument that sets it, and MUST be traceable to the provision it came from.

A threshold MUST NOT be a value somebody thought reasonable. Where an instrument sets different thresholds for different kinds of organisation, the one applied MUST be the one for that customer's kind, and which kind was used MUST be visible.

The stored text of the provisions MUST be kept alongside, so that a figure can be checked against what it claims to quote rather than against somebody's memory of it.

#### Scenario: A threshold is applied

- GIVEN an assessment turning on a numeric threshold
- WHEN it is read
- THEN the figure is shown with the provision that sets it

#### Scenario: Thresholds differ by kind of organisation

- GIVEN an instrument setting different thresholds by service type
- WHEN a customer's case is assessed
- THEN the threshold for that customer's type is used
- AND which type was assumed is visible

#### Scenario: A quoted figure drifts from its source

- GIVEN a threshold quoted from a stored provision
- WHEN the two disagree
- THEN that disagreement is detectable without reading the law again

### Requirement: The application assesses; the organisation reports

The application MUST NOT notify an authority, and MUST NOT be the system of record for having done so.

Filing is an act with legal consequence taken by a named person under an organisation's own procedure. Building it here would put a regulatory submission behind a button, in an application that cannot know whether the organisation's own process was followed.

What the application MUST do is tell an analyst what is owed, to whom, by when, and what the case can say towards it — and record what the analyst says was done.

#### Scenario: An assessment finds a notification is owed

- GIVEN an assessment that decides a regime requires notification
- WHEN an analyst reads it
- THEN they are told which authority, under which article, and by when
- AND nothing is sent

#### Scenario: A notification was made

- GIVEN an analyst who has notified an authority through their own process
- WHEN they record that
- THEN the case holds when it was done and by whom
- AND the application does not claim to have done it

### Requirement: A regime that does not apply is not assessed

An assessment MUST cover only the regimes that apply to the case, and which regimes those are is one of the organisation facts the case holds its own copy of.

A case takes its applicable regimes from its customer the way it takes every other organisation fact: copied, not read live. A change at the customer — including a move to a different one — MUST NOT silently add or remove a regime from a case that has not adopted it.

Where the customer's set differs from the case's, the case MUST say so and the analyst MUST choose, as with any other copied fact. Until they do, the assessment runs on what the case holds.

A case MUST NOT be reported as incomplete for leaving unanswered the facts of a regime that does not reach its customer.

#### Scenario: A customer is outside a regime

- GIVEN a customer to which a regime does not apply
- WHEN a case for them is assessed
- THEN that regime is absent rather than shown as undecidable
- AND its facts are not asked for

#### Scenario: A case moves to a customer under different regimes

- GIVEN a case assessed under the regimes it copied
- WHEN it moves to a customer whose regimes differ
- THEN the assessment continues on the set the case holds
- AND the case shows that its customer's set differs

#### Scenario: The analyst adopts the new customer's regimes

- GIVEN a case showing that its regimes differ from its customer's
- WHEN the analyst adopts the customer's set
- THEN the assessment is redrawn
- AND facts recorded for a regime that no longer applies are kept rather than discarded

#### Scenario: A regime is added by a move

- GIVEN a case moved to a customer under a regime the case was not assessed against
- WHEN the assessment is read before the analyst adopts it
- THEN the new regime is not silently reported as satisfied or unsatisfied
- AND the analyst is told an unadopted regime is waiting

### Requirement: Reporting stage is tracked against the case, not as its condition

Where a regime requires more than one submission over time, which have been made MUST be tracked against the case.

This MUST NOT be the case's state. A case can be contained and still owe a final report, and can owe an intermediate report while the incident is live. One axis cannot say both.

An analyst MUST be able to see what is owed next and when it falls due, from the moment the assessment decides that anything is owed.

#### Scenario: A first submission is made and a later one is owed

- GIVEN a regime requiring an initial and a final submission
- WHEN the analyst records the initial one
- THEN the case shows the final one as outstanding, with its due moment

#### Scenario: A deadline approaches

- GIVEN a case owing a submission with a deadline
- WHEN that deadline nears
- THEN it is visible without opening the case

#### Scenario: The case is closed with a submission outstanding

- GIVEN a case owing a regulatory submission
- WHEN an analyst attempts to close it
- THEN it is refused, and the outstanding submission is named

### Requirement: An assessment is a reading of the case at a moment, and it moves

An assessment MUST be derived from what the case records rather than stored as a conclusion somebody reached.

When a fact changes, the assessment MUST change with it, and the analyst MUST be told when a change moves an outcome — particularly when it moves it towards something being owed.

#### Scenario: A fact changes after an assessment was read

- GIVEN a case assessed as not reportable
- WHEN a recorded fact changes such that it becomes reportable
- THEN the assessment says so
- AND the change is apparent rather than requiring the analyst to look again

#### Scenario: An assessment is quoted in a report

- GIVEN a report quoting an assessment
- WHEN the case's facts later change
- THEN what the report said remains what it said
- AND the difference from the current assessment is discoverable
