# Scope

**A case belongs to exactly one customer, and nothing crosses between two.** The case is the unit of work and the unit of access; there is no shared entry, no entity common to two cases, and no report drawing from more than one.

**A case always has a customer.** Where nobody yet knows whose incident it is, that customer is the install's default rather than an absence — an incident is routinely opened before anyone knows, and refusing to open one until the answer is known is refusing the work.

**The state is a marker, not a gate.** A case is not required to pass through every state and can return to an earlier one. Closing is the single exception.

**The state vocabulary is not this product's to rename.** It takes the incident response functions of the NIST Cybersecurity Framework 2.0 as SP 800-61r3 applies them, with one closing state added.

**A deletion is never silent.** Destroying a case is itself a record, and the record outlives the case.

# Design

## Identity

A case carries a title an analyst recognises it by, and a reference to a customer the system holds as a thing in its own right rather than text typed on the case.

A case may carry a reference the customer or the SOC knows it by. Where present it is unique within that customer; where absent it collides with nothing, so several cases without one coexist.

## Where the work sits

Four states: **respond** and **recover** while the incident is live, **post-incident** once it is over and what remains is reporting and lessons learned, and **closed** when nothing is outstanding.

Moving between them is an attributed change like any other, and the state is never inferred from the presence or absence of other data.

Closing is gated on what the case owes rather than on where it has been: a case with reporting or lessons outstanding, from any regime, cannot close. Every other transition is free in both directions.

Which cases are live and which are in write-up is answerable from a list without opening any of them.

## Reach is decided once, by customer

Whether a caller may reach a case is decided in a single place, ahead of anything that serves the case's contents.

An analyst reaches a case where they reach that case's customer, and does to it only what their level over that customer permits. The decision is made against the customer rather than against the case, so a case moving between customers moves its reach with it.

## Destruction leaves a record that outlives it

Deleting a case writes a record naming who deleted it, when, and enough about the case to recognise which one it was.

That record lives where the deletion does not reach. A record stored inside the case, or keyed so that removing the case removes it, is not a record of the deletion.

## Demonstration content is marked, and the marking is load-bearing

Content that exists to demonstrate the product is distinguishable from an analyst's own work, both to a person reading a list and to anything answering a question.

Anything answering a question about real investigations excludes it unless it was asked for. The distinction is carried on the case rather than inferred from its contents or its customer.

## Returning to recent work

An analyst returns to what they were working on without searching for it. What is offered is theirs rather than the install's, and it respects reach: a case they can no longer reach is not offered back to them.
