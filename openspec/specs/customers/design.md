# Scope

**A customer is identified independently of its name**, so renaming an organisation breaks nothing that refers to it.

**The install always holds a default customer.** It stands for an incident whose origin is not yet known, cannot be deleted, and cannot be edited into an ordinary customer.

**A case reads a copy, never the customer's live values.** A report written months ago says what was true when it was written, and correcting a customer's record does not rewrite history.

**The system never decides that a case should take an updated value.** It shows that one moved; the analyst chooses.

# Design

## What a customer holds

The facts a regulatory assessment asks about the organisation rather than about the incident, answered once instead of at every case: which regimes apply to it at all, its home member state, whether it operates beyond the EU and where, its competent authority, its data protection officer's contact, the size of its user base, its annual turnover, its critical functions, and the services it provides that are supervised.

These are the organisation's facts. Anything that changes with each incident belongs to the case.

**Which regimes apply is the one an organisation answers and a case does not copy.** It decides which questions a case is *asked* rather than answering one of them, so copying it would freeze a case's questionnaire to whatever applied when its compliance record was first raised — and a case would then go on being assessed against a regime the organisation has since been found not to be subject to. A case reads it live and copies the rest.

**It is still a fact two records can disagree about.** A merge disputes every organisation fact including this one; only the copy excludes it. The two purposes are different and the sets are not the same set.

## A case copies, and is told when the original moves

A case takes its own copy of the organisation's facts when it is created.

Where a copied value no longer matches the customer's, the case shows that it diverged. Taking the new one is an act the analyst performs; nothing updates a case silently, including a case moving to a different customer.

## A case may answer for an organisation nobody has onboarded

An incident sometimes concerns an organisation the system does not hold, and the investigation does not wait for onboarding. An analyst answers the organisation's compliance facts on the case itself.

Answers given that way are recognisable as the case's own rather than as a copy, so onboarding the organisation later does not silently overwrite what the analyst recorded.

**Owned is provenance, not difference.** A fact is the case's own because the analyst answered it, whether or not the answer happens to match what some customer holds later — the requirement is written for a case with no customer to differ from, so "differs from the customer" is not even computable in the case it exists for. Whether a copied value has since moved is a separate question, answered by comparing the two.

**What marks a fact as answered is that its value changed.** That is a proxy for intent rather than intent itself: a client that submits a whole record cannot say which fields the analyst touched, so the system infers it. The residual gap is an analyst who retypes the value already there and is not recorded as having answered — nothing they wrote is lost, and drift against the customer is reported independently of ownership. If a client is ever able to send only what it changed, presence becomes intent again and the inference can go.

## A customer cannot be removed out from under its cases

Removing a customer never leaves a case belonging to nothing and is never a way to make cases unreachable without a record.

Where two records turn out to be one organisation they are merged, since duplicates are how customer records actually go wrong and moving cases one at a time invites missing some. A merge moves every case at once and leaves a record of what was merged into what.

A merge settles a disagreement; it does not edit. Where the two records answer a fact differently the analyst chooses which answer survives, and a choice offered for a fact they already agree on is refused — accepting it would let a merge change an answer neither record held.

**The reference check is a boundary at the merge and nowhere else.** A merge refuses to *create* two cases with one external reference under a single customer; nothing forbids that state existing, and no uniqueness is enforced on the reference anywhere. The reference is the customer's own ITSM ticket, deliberately not unique, and two organisations legitimately share a ticket number. Enforcing it as an invariant would refuse states the rest of the system permits freely — including the ordinary one where every unattributed case sits under the default customer.
