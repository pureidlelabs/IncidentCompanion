# Compliance

## MODIFIED Requirements

### Requirement: A regime that does not apply is not assessed

An assessment MUST cover only the regimes that apply to the case, and which regimes those are is one of the organisation facts the case holds its own copy of.

A case takes its applicable regimes from its customer the way it takes every other organisation fact: copied, not read live. A change at the customer — including a move to a different one — MUST NOT silently add or remove a regime from a case that has not adopted it.

Where the customer's set differs from the case's, the case MUST say so and the analyst MUST choose, as with any other copied fact. Until they do, the assessment runs on what the case holds.

A case MUST NOT be reported as incomplete for leaving unanswered the facts of a regime that does not reach its customer.

**Reaching the customer is one gate and being in play is another.** A regime the customer is under still asks whether this case falls inside it, and until that question has an answer the case is in play for nothing under it. A regime a case is not in play for MUST be absent from the assessment exactly as one that does not reach the customer is, and MUST NOT be reported as incomplete. A case cannot be short of facts for a regime it is not being assessed under.

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

#### Scenario: A regime reaches the customer and the case is not yet in play for it

- GIVEN a regime the customer is under
- AND a case that has not answered what decides whether it falls inside that regime
- WHEN the case is assessed
- THEN that regime is absent rather than shown as undecidable
- AND the case is not reported as short of its facts
