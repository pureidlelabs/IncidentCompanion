# Collections

## Purpose

What a case holds. Systems, accounts, malware, indicators, methods, actions, cloud applications, impact, the timeline, evidence, notes and the report's own parts are all rows belonging to one case, and they are the same kind of thing at the level this specification works at.

There is one way to read and write them. What differs between a system and a timeline entry is what a row *is*, and that belongs where the row is described — not to a second implementation of reading and writing.

## Requirements

### Requirement: One implementation, and what differs is described rather than coded

Reading, writing, ordering, removing and importing a collection MUST be one implementation shared by all of them.

What a row consists of — its fields, their kinds, what is required, what vocabulary a field draws from — MUST be described in one place per collection, and MUST be the only thing that differs.

A collection MUST NOT grow its own path for any of these. A twelfth way of writing a row is eleven chances for the guarantees below to be absent from one of them, and the absence is invisible.

#### Scenario: A collection is added

- GIVEN a new kind of thing a case should hold
- WHEN it is added by describing what a row is
- THEN it can be read, written, ordered, removed and imported
- AND nothing was implemented for it

#### Scenario: A collection needs behaviour the others do not have

- GIVEN a collection needing something particular
- WHEN that is built
- THEN it is expressed in what the row is, or added to the one implementation for all of them
- AND not as a second path for that collection alone

### Requirement: A row is checked against its description, where the caller cannot reach

Every row written MUST be checked against the description of what that row is — its required fields, the kind of each, the vocabulary a field draws from, and the relationships between fields that make a row coherent.

That check MUST happen where the caller cannot influence it. A screen checking before it submits is a convenience for the analyst; it is not the check, and a caller that is not that screen must meet the same standard.

The description used to check MUST be the same one the screens are drawn from and the same one an import is read against. A second description drifts, and the drift shows up as a value one path accepts and another refuses.

A refusal MUST name the field and what was wrong with it.

#### Scenario: A caller submits a row the screen would not have

- GIVEN a row that the screen's own checking would refuse
- WHEN a caller submits it directly
- THEN it is refused
- AND the refusal names the field

#### Scenario: A field draws from a vocabulary

- GIVEN a field whose values come from a fixed vocabulary
- WHEN a row supplies something outside it
- THEN it is refused

#### Scenario: Fields disagree with each other

- GIVEN a row whose fields are each acceptable alone
- WHEN their combination is not coherent
- THEN it is refused
- AND the refusal says which combination

### Requirement: The description is retrievable, so what a case may hold is answerable from the application

A caller MUST be able to ask the application what a collection can hold: its fields, what each is, which are required, what vocabulary a field draws from, what a reference field points at, and how a person is meant to read them.

That answer MUST be derived from the same description that checks a write and draws a screen. It MUST NOT be a document written beside it — a second description is stale from the moment somebody adds a field and does not remember it exists.

The answer MUST be for the install being asked, not for the version that shipped. Where an install carries vocabularies, layouts or content somebody dropped into it, those are part of what it holds and MUST appear.

**This is what makes "what does a case hold" answerable at all.** The alternative is reading the source, which is unavailable to an analyst, out of date for anybody who has extended their install, and a question they have while working rather than while developing.

#### Scenario: An analyst asks what a field accepts

- GIVEN a field drawing from a vocabulary
- WHEN an analyst asks what it accepts
- THEN they are told, from the application

#### Scenario: A field is added

- GIVEN a collection whose description gains a field
- WHEN the description is retrieved
- THEN the new field is there
- AND nobody wrote it down a second time

#### Scenario: An install has been extended

- GIVEN an install carrying content its operator added
- WHEN the description is retrieved
- THEN what that install holds is described
- AND not what the version that shipped held

### Requirement: Every write is attributed, checked and announced as one act

A write MUST record who made it, MUST be refused where the row moved since the writer read it, and MUST announce that the row changed — and these MUST succeed or fail together.

A write that lands without attribution is a change nobody can defend. One that lands without the version check overwrites somebody. One that lands without the announcement leaves every other open screen believing something untrue. A write path that does two of the three is worse than one that does none, because it looks correct.

A refusal MUST say what the row is on now, so the writer can work out what changed.

#### Scenario: Two analysts write to one row

- GIVEN two analysts who read the same row
- WHEN the second writes after the first
- THEN it is refused with the row's current version
- AND the first analyst's change stands

#### Scenario: A write succeeds

- GIVEN an analyst changing a row
- WHEN the write lands
- THEN it carries who made it
- AND every screen open on that case learns the row changed

### Requirement: A reference points inside its own case, and the store alone cannot enforce it

A row referring to another row MUST refer to one in the same case.

**This cannot be left to the store's own referential integrity.** A key constraint is checked outside the boundary rules, so a row naming another case's row satisfies the constraint, meets no policy, and lands. The row is then in one case pointing at another, which is the boundary broken from the inside.

The check MUST run inside the same scoped operation as the write, so that asking whether the referenced row exists is already asking whether it exists *in this case*.

Every reference MUST be checked: those an analyst chooses from a list, and those the application sets itself. A reference nobody enumerated is a reference nobody checks.

#### Scenario: A row references another case's row

- GIVEN a row being written into one case
- WHEN it references a row belonging to another
- THEN the write is refused

#### Scenario: A reference is added to what a row is

- GIVEN a new reference field on a collection
- WHEN a row using it is written
- THEN it is checked against the case boundary
- AND being newly added did not exempt it

#### Scenario: A referenced row is removed

- GIVEN a row referenced by another
- WHEN it is removed
- THEN the referring row does not leave its own case

### Requirement: Only some collections have an identity, and the rest are events

**A thing has an identity; an event does not.** Systems, accounts and the other collections that describe something in the world MUST have a rule for whether two rows are the same thing, so that importing the same host twice does not double it.

The timeline, actions, notes, evidence, impact, reports and their parts MUST NOT. Two entries that look alike are two facts, and merging them loses one. For these, sameness MUST NOT be inferred at all — not by resemblance, not by content, not by proximity in time.

Where a collection has an identity, that rule MUST be one rule, used by every path that could create a row. Two importers answering "have I got this already" differently doubles a case on a re-import, and neither of them is wrong on its own.

An identity rule MUST be insensitive to what a person would consider the same: a hostname's case and surrounding space, an account's domain written either way.

#### Scenario: The same host is imported twice

- GIVEN a case already holding a host
- WHEN an import supplies the same host, cased differently and padded
- THEN it is recognised as the one already there

#### Scenario: The same timeline entry is imported twice

- GIVEN a case already holding a timeline entry
- WHEN an import supplies an identical one
- THEN both are kept
- AND nothing merges them

#### Scenario: A second way of creating rows is added

- GIVEN a collection with an identity rule
- WHEN a further path can create its rows
- THEN it decides sameness by the same rule
- AND cannot answer differently

### Requirement: Doing something to many rows obeys every rule that governs one

Acting on rows in bulk MUST carry every guarantee a single write carries: attribution, the version check, the announcement, the case boundary, and the reference check.

A bulk path MUST NOT be a faster path. Where speed and the guarantees conflict, the guarantees win.

Where part of a bulk act cannot be performed, the caller MUST be told which rows and why, and MUST NOT be left unable to tell what happened.

#### Scenario: Some rows in a bulk write have moved

- GIVEN a bulk write over several rows
- WHEN some have changed since they were read
- THEN the caller is told which
- AND the outcome for every row is determinable

#### Scenario: A bulk write crosses the case boundary

- GIVEN a bulk write including a row from another case
- WHEN it is attempted
- THEN it is refused

### Requirement: Order an analyst chose is theirs, and is not a property of the data

Where an analyst arranges rows, that order MUST be recorded and MUST survive everything that does not change it: reading, filtering, another analyst's write elsewhere, an import.

Order MUST NOT be inferred from when a row was created or last changed, because editing an entry would then move it.

Reordering MUST be an attributed change like any other.

#### Scenario: An analyst reorders rows

- GIVEN rows an analyst has arranged
- WHEN one of them is edited
- THEN the order is unchanged

#### Scenario: Rows arrive from an import

- GIVEN rows an analyst has arranged
- WHEN an import adds more
- THEN the arrangement of the existing rows is unchanged

### Requirement: What comes in and goes out is the same description

Importing rows into a collection and exporting them MUST use the description of what a row is, so that what the application accepts is what it produces.

An import MUST tell the analyst what it will do before it does it, and MUST report per row afterwards: taken, recognised as already present, or refused with the reason.

An import MUST NOT partially apply without saying so. An analyst who cannot tell which rows landed will import again.

#### Scenario: An analyst previews an import

- GIVEN a file of rows
- WHEN the analyst asks what it would do
- THEN they are told, per row, before anything is written

#### Scenario: A row in an import is malformed

- GIVEN an import where one row cannot be accepted
- WHEN it runs
- THEN that row is reported with why
- AND the analyst can tell what happened to every other row

#### Scenario: An export is imported back

- GIVEN rows exported from a case
- WHEN they are imported into another
- THEN they are accepted
- AND nothing had to be edited to make them acceptable
