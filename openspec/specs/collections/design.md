# Scope

**A collection is not a feature.** Systems, accounts, malware, indicators, methods, actions, cloud applications, impact, the timeline, evidence, notes and the report's own parts are the same kind of thing at this level. Adding one is describing a row, never writing a second implementation of reading and writing it.

**What a row consists of is stated once and is not restated anywhere.** No document lists a collection's fields; the description that checks a write is the same one that draws a screen and answers a caller who asks.

**A bulk path is not a faster path.** Where speed and the guarantees conflict, the guarantees win.

**A reorder is refused whole or written whole.** There is no partial reorder, and none that keeps the rows that did not move while refusing the rest.

**Sameness is not inferred for an event.** The timeline, actions, notes, evidence, impact, reports and their parts have no identity rule at all — not by exact match, not by resemblance, not by an analyst confirming a suggestion.

**A selection's change answers which rows took it, not what they became.** So a row with a change in flight offers no second change until the first is answered and the row read again, rather than the client guessing the version the first one reached.

# Design

## One implementation, one description per collection

Reading, writing, ordering, removing and importing are one implementation shared by every collection. What differs between them is a description: the fields, the kind of each, which are required, the vocabulary a field draws from, what a reference field points at, and how a person is meant to read a row.

That description is the single source for three things that must never disagree — the check made on a write, the shape a screen draws, and the answer given to a caller who asks what a collection can hold.

## A row is checked where the caller cannot reach

Every row written is checked against its description: required fields, the kind of each, the vocabulary a field draws from, and the relationships between fields that make a row coherent.

The check happens beyond the caller's influence. A screen checking before it submits is a convenience for the analyst and is not the check; a caller that is not that screen meets the same standard.

## A write is one act with four parts

A write records who made it, is refused where the row moved since the writer read it, announces that the row changed, and stays inside the case boundary. These succeed or fail together.

A write landing without attribution is a change nobody can defend. Without the version check it overwrites somebody. Without the announcement it leaves every other open screen believing something untrue.

Acting on many rows carries all of it, per row.

**Composed into a larger act, the announcement waits for that act to commit.** A write inside somebody else's transaction has not landed when it returns -- its own commit is a released savepoint -- so announcing there sends a subscriber to read what a rollback may still remove. Announcing nothing instead is the other way to break the same rule, and it is the quieter one: the act commits and every screen already open stays as it was.

So the act collects what its writes would have said and says it once, after the commit that made it true. A write that opened its own transaction announces directly, as before.

**A transaction that is not declared an act refuses the write composed into it.** The alternative is a composed write silently choosing one of the two failures above, which is what made this a rule nobody could see being broken. The boundary: composition is an explicit act rather than any open transaction.

## A selection is acted on as it was read

A selection holds the version each row had when the analyst pressed the act, and the dialog confirming it acts on those. A row another analyst changed while the dialog was open is refused and named, never deleted or overwritten at the version the confirmation happened to find. A row with a change in flight offers no second change until the first is answered and the row read again.

## A reference stays inside its case, checked twice over

A row referring to another row refers to one in the same case. The store's own referential integrity cannot express this: a key constraint is satisfied by a row in another case, which meets no policy and lands.

So the check is made by the application, on both kinds of reference — the one an analyst picks from a field, and the one that makes a row identity. Missing either leaves the boundary unchecked, and a write reaching the store outside the shared implementation asks for the check itself.

## Identity belongs to things, not events

A collection describing something in the world — a system, an account — carries a rule for whether two rows are the same thing, so importing the same export twice does not double it.

A collection recording something that happened carries no such rule. Two entries that look alike are two facts, and merging them loses one.

An identity is a ladder rather than a single key: a row may be known by everything it states or by less, so a naming that carries a qualifier still matches a stored row that omits it. A match is taken at the strongest rung the arriving row states, because the weakest rung is shared by every row that differs only in the qualifier, and matching there updates whichever of them the index happened to reach.

Where the case holds two rows answering to one naming, the first is kept. No column constraint enforces an identity, so that case is reachable, and a rule choosing between them arbitrarily makes one import differ from the next for a reason an analyst cannot see. First is not better than last; being the same answer every time, through every path that creates rows, is the whole of it.

## Order an analyst chose is data

Where an analyst arranges rows, that arrangement is recorded and survives reading, filtering, another analyst's write elsewhere, and an import.

It is never inferred from when a row was created or last changed, because editing an entry would then move it.

**An order is written under the version check.** A reorder names every row of the set it arranges with the version it read. The set is locked in one fixed order before anything is compared, so two reorders of it queue rather than interleave or wait on each other; the second then finds the rows the first moved at their new versions and is refused whole, naming them.

**A reorder answers with the versions it left.** Every row it arranged comes back at the version it now holds. A screen writes those into what it holds as soon as they arrive and sends its reorders of one set one at a time, so each carries what the last one left.

## Import and export are the same description

What the application accepts is what it produces. An import states what it will do before it does it, and reports per row afterwards: taken, recognised as already present, or refused with the reason.

## Every collection takes a batch write, including evidence

A record of evidence and the bytes of an artefact are two things. The record says a piece of evidence exists, what it is, and where it is held; the bytes arrive on their own route, and only then does the record say this install holds them. Most evidence is held somewhere else and always will be, so a record with no bytes behind it is the ordinary case rather than an incomplete one.

That is why evidence takes a batch write like every other collection. The fields that say bytes are held — the digest, the function that produced it, and the moment they were stored — are written by the upload and are not offered at any door an analyst types into, single or batch. A caller naming one is refused rather than having it dropped, because an answer of *accepted* to that request hands back a record the caller believes says something it does not.

**The boundary this sets:** no door that accepts typed fields may write the fields that say an artefact is held. Adding one is how a record comes to claim a file nobody uploaded, and an install that reconciles what it holds against what is beside it then reports that artefact missing for ever.

## A derived field has one writer

A collection states which of its fields are derived from the row's prose. A single or bulk write naming one is refused, naming it; creating the row may give it, as the prose's first words.

Those first words become the prose the first time it is opened, and are stored then. Built again from the field on a later open they would be new words, and a screen still holding the first ones would merge the two.
