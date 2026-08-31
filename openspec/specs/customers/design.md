# Scope

**A customer is identified independently of its name**, so renaming an organisation breaks nothing that refers to it.

**The install always holds a default customer.** It stands for an incident whose origin is not yet known, cannot be deleted, and cannot be edited into an ordinary customer.

**A case reads a copy, never the customer's live values.** A report written months ago says what was true when it was written, and correcting a customer's record does not rewrite history.

**The system never decides that a case should take an updated value.** It shows that one moved; the analyst chooses.

# Design

## What a customer holds

The facts a regulatory assessment asks about the organisation rather than about the incident, answered once instead of at every case: which regimes apply to it at all, its home member state, whether it operates beyond the EU and where, its competent authority, and its data protection officer's contact.

These are the organisation's facts. Anything that changes with each incident belongs to the case.

## A case copies, and is told when the original moves

A case takes its own copy of the organisation's facts when it is created.

Where a copied value no longer matches the customer's, the case shows that it diverged. Taking the new one is an act the analyst performs; nothing updates a case silently, including a case moving to a different customer.

## A case may answer for an organisation nobody has onboarded

An incident sometimes concerns an organisation the system does not hold, and the investigation does not wait for onboarding. An analyst answers the organisation's compliance facts on the case itself.

Answers given that way are recognisable as the case's own rather than as a copy, so onboarding the organisation later does not silently overwrite what the analyst recorded.

## A customer cannot be removed out from under its cases

Removing a customer never leaves a case belonging to nothing and is never a way to make cases unreachable without a record.

Where two records turn out to be one organisation they are merged, since duplicates are how customer records actually go wrong and moving cases one at a time invites missing some. A merge moves every case at once and leaves a record of what was merged into what.
