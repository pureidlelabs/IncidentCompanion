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

## Attributing a case is its own act, at the level of the customer it has now

Which customer a case answers for is not a field on the edit form. It decides who may reach the case, so it is performed and refused on its own terms.

**The level asked for is write over the customer the case has now, and nothing more.** An analyst working a case is who learns whose incident it was, so requiring an administrator would leave that discovery with nowhere to go. Reaching the *destination* is deliberately not asked either: the organisation a case turns out to belong to is usually one the analyst does not yet work for, and requiring reach there refuses the ordinary use.

**A case can therefore be moved out of the mover's own reach.** That is a boundary rather than an oversight: they already reached the case, so the move gains them nothing, and the act is recorded against both customers. Undoing it is not free — being an administrator carries no reach over a case, so whoever moves it back reaches the destination through a group like anybody else.

**The default customer is not a destination.** Every analyst reaches it, so moving an attributed case there would widen who reads that organisation's incident to the whole install — and it would falsify what the floor rests on, which is that whatever stands against the default is nobody's yet.

**So a wrong attribution cannot be undone by returning the case to where it started**, where it started was nothing. Nothing distinguishes a case never attributed from one attributed to the default, so there is no state to return it to; the case is moved on to the right organisation instead of back.

**Moving a case copies nothing and rewrites nothing.** A case's copy of the organisation's facts records what was true when it took them. Drift is reported against whichever customer the case answers for at the time of asking, so after a move the analyst is shown the new customer's answers beside their own and chooses — the system does not choose for them, here as anywhere.

**A connection open on the case is ended rather than re-checked.** Re-deciding reach inside a live connection would be a second copy of the reach rules kept in step by hand; ending it makes the client reconnect, and the reconnection asks the one place that decides.

## Destruction leaves a record that outlives it

Deleting a case writes a record naming who deleted it, when, and enough about the case to recognise which one it was.

That record lives where the deletion does not reach. A record stored inside the case, or keyed so that removing the case removes it, is not a record of the deletion.

## Demonstration content is marked, and the marking is load-bearing

Content that exists to demonstrate the product is distinguishable from an analyst's own work, both to a person reading a list and to anything answering a question.

Anything answering a question about real investigations excludes it unless it was asked for. The distinction is carried on the case rather than inferred from its contents or its customer.

## Returning to recent work

An analyst returns to what they were working on without searching for it. What is offered is theirs rather than the install's, and it respects reach: a case they can no longer reach is not offered back to them.
