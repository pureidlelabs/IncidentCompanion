# Scope

**A collection is not a feature.** Systems, accounts, malware, indicators, methods, actions, cloud applications, impact, the timeline, evidence, notes and the report's own parts are the same kind of thing at this level. Adding one is describing a row, never writing a second implementation of reading and writing it.

**What a row consists of is stated once and is not restated anywhere.** No document lists a collection's fields; the description that checks a write is the same one that draws a screen and answers a caller who asks.

**A bulk path is not a faster path.** Where speed and the guarantees conflict, the guarantees win.

**Sameness is not inferred for an event.** The timeline, actions, notes, evidence, impact, reports and their parts have no identity rule at all — not by exact match, not by resemblance, not by an analyst confirming a suggestion.

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

## A reference stays inside its case, checked twice over

A row referring to another row refers to one in the same case. The store's own referential integrity cannot express this: a key constraint is satisfied by a row in another case, which meets no policy and lands.

So the check is made by the application, on both kinds of reference — the one an analyst picks from a field, and the one that makes a row identity. Missing either leaves the boundary unchecked, and a write reaching the store outside the shared implementation asks for the check itself.

## Identity belongs to things, not events

A collection describing something in the world — a system, an account — carries a rule for whether two rows are the same thing, so importing the same export twice does not double it.

A collection recording something that happened carries no such rule. Two entries that look alike are two facts, and merging them loses one.

## Order an analyst chose is data

Where an analyst arranges rows, that arrangement is recorded and survives reading, filtering, another analyst's write elsewhere, and an import.

It is never inferred from when a row was created or last changed, because editing an entry would then move it.

## Import and export are the same description

What the application accepts is what it produces. An import states what it will do before it does it, and reports per row afterwards: taken, recognised as already present, or refused with the reason.
