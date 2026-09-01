# Data exchange

## Purpose

An analyst works in more than one tool. A table of hosts arrives as a spreadsheet, a list of indicators has to reach a blocking platform, and a colleague wants the timeline in something they can open. This spec covers moving collection data in and out of a case as a file.

It covers what a file carries, what an import may and may not change, and what the application does to content that is hostile to the program that will open it. Bringing a whole case in or out of an install is the case archive spec. Bringing an incident in from a detection platform is the incident import spec. What a collection holds and how a write is checked belongs to the collections spec.

## Requirements

### Requirement: What the application writes, it can read back

A collection exported to a file MUST be importable into a case without editing. The file MUST carry the fields an analyst supplies, and MUST NOT be made unreadable by fields the application owns.

Where a file carries a field the application decides for itself — what identifies a row, which case it belongs to, what version it is at, who wrote it and when — the import MUST ignore that field rather than refuse the file, because refusing it would make the application's own export unimportable.

A file naming a field the collection does not have MUST be refused, and the refusal MUST name the field. A field the analyst has misspelled is a mistake to report, not a value to guess at.

#### Scenario: An export is imported unchanged

- GIVEN a collection exported from a case
- WHEN the file is imported into a case
- THEN every row it carries is written
- AND nothing had to be removed from the file first

#### Scenario: A file names a field that does not exist

- GIVEN a file whose header names a field the collection does not have
- WHEN it is imported
- THEN the import is refused
- AND the refusal names the field it did not recognise

#### Scenario: A blank value

- GIVEN a file in which a row leaves a value blank
- WHEN it is imported
- THEN that field is treated as not given
- AND it is not written as an empty value

### Requirement: An import is all of it or none of it

An import MUST NOT leave a case holding part of a file. Where any row cannot be written, no row MUST be written, so an analyst who fixes the file and imports it again does not have to work out what already went in.

An import MUST report what it did in enough detail for the analyst to know the case's state without opening it: how many rows were added, how many were already there, how many were refused, and how many were written with something missing.

#### Scenario: One row in a file is invalid

- GIVEN a file in which one row fails the collection's description
- WHEN it is imported
- THEN no rows are written
- AND the analyst is told which row was wrong

#### Scenario: An import succeeds

- GIVEN a valid file
- WHEN it is imported
- THEN the analyst is told how many rows were added and how many were already present

### Requirement: A reference travels as what it points at, not as where it was kept

A reference in a file MUST be written in a form that means something outside the case that produced it. Where a file carries the place a row was stored, the reference is unresolvable the moment the file crosses a case boundary — which is the ordinary use of a file, not an edge case.

On import, a reference MUST be resolved against what the destination case holds, and the row MUST be written pointing at the destination's own row. A reference that resolves MUST therefore point inside the case being written to, as any reference must.

A value naming where a row was kept MUST NOT be usable as a reference. Otherwise a file becomes a way to name a row in a case the analyst importing it may not reach.

#### Scenario: A file is imported back into the case it came from

- GIVEN a collection exported from a case and imported into that same case
- WHEN a row carries a reference
- THEN it points at the same row it pointed at before

#### Scenario: A file is imported into another case holding the same thing

- GIVEN a file from one case, carrying a reference to a host
- AND a destination case that also holds that host
- WHEN the file is imported
- THEN the row points at the destination case's own host

#### Scenario: A file names where a row was kept

- GIVEN a file carrying the place a row was stored rather than what it is
- WHEN it is imported
- THEN nothing is resolved from it
- AND no row in another case is reached

### Requirement: A reference the destination cannot resolve is reported, never dropped in silence

Where the destination case does not hold what a reference points at, the import MUST write the row without the reference rather than refuse it, because a file describing things the destination does not have is a normal thing to import.

The analyst MUST be told how many references could not be carried, and to what kind of thing, so a case is not quietly less connected than the file implied. An import that silently drops references produces a case whose gaps are discovered by whoever next reads it and cannot tell whether the connection was never made or was lost.

#### Scenario: The destination does not hold the referenced thing

- GIVEN a file whose row references a host the destination case does not hold
- WHEN it is imported
- THEN the row is written without that reference
- AND the analyst is told how many references could not be carried

#### Scenario: An import that carried everything

- GIVEN a file every reference of which resolves in the destination
- WHEN it is imported
- THEN the analyst is told that nothing was lost

### Requirement: An import says what to do about something already there

Where a collection has an identity, an import MUST let the analyst decide in advance what happens to a row the case already holds: leave what is there, or replace it with what the file says.

Replacing MUST obey the same version check as any other write. A row somebody else has changed since the file was made MUST be reported as refused rather than overwritten, and MUST be distinguishable from a row that was deliberately left alone.

Where a collection's rows are events rather than things, an import MUST write every row. Two identical events are two events.

#### Scenario: The analyst does not say what to do

- GIVEN an import naming no preference about rows already present
- WHEN a row in the file matches one the case holds
- THEN the existing row is left as it is

#### Scenario: A row was changed by somebody else

- GIVEN an import asked to replace rows already present
- AND a row another analyst has changed since the file was made
- WHEN the import runs
- THEN that row is reported as refused
- AND it is not reported as merely skipped

#### Scenario: An unrecognised instruction

- GIVEN an import naming an instruction the application does not offer
- WHEN it runs
- THEN it is refused
- AND it does not fall back to a default

### Requirement: What leaves the application cannot execute in what opens it

A value written into a file MUST NOT be able to run as a program in the application that opens it. A spreadsheet treats some leading characters as the start of a formula, and case data routinely begins with them.

The application MUST neutralise such a value on the way out without being asked, and MUST do so in a way that survives being opened and saved again by a program that strips one layer of the protection.

Neutralising MUST NOT alter what the analyst recorded. A value that reads as a formula MUST still read as itself when the file is imported back, so that evidence is not edited by the act of exporting it.

#### Scenario: A value begins as a formula

- GIVEN a row whose value begins with a character a spreadsheet treats as a formula
- WHEN the collection is exported
- THEN the value is written so that it cannot execute
- AND the analyst's value is unchanged when the file is imported back

#### Scenario: A file that has already been through a spreadsheet

- GIVEN an exported file opened and saved again by a spreadsheet
- WHEN it is exported from that spreadsheet and imported here
- THEN the value still cannot execute
- AND it still reads as what the analyst recorded

### Requirement: Content that hides what it says is refused before it is stored

Text arriving in a file MUST NOT be able to display as something other than what it is. Characters that reverse reading order, or that occupy no width, make a stored value read one way to a person and another way to a program.

Where such characters arrive in a value the application interprets, they MUST be removed before it is stored rather than rendered later.

#### Scenario: A value carries characters that cannot be seen

- GIVEN an incoming value holding direction overrides or zero-width characters
- WHEN it is read
- THEN those characters are removed
- AND what is stored reads the same to a person as to a program

### Requirement: A file has a size the application will accept, and says so when it will not

An import MUST bound what it will read before reading it. A file larger than the install accepts, or holding more rows than it accepts, MUST be refused with a refusal naming the limit rather than by exhausting the install.

#### Scenario: A file is too large

- GIVEN a file larger than the install accepts
- WHEN it is imported
- THEN it is refused
- AND the refusal names the limit

### Requirement: An indicator feed is what a defender can act on

An install MUST be able to publish a case's indicators in a form a defensive platform can consume, so that what an investigation found can be blocked without being retyped.

A feed intended for action MUST carry only indicators an analyst would act on. An indicator recorded as harmless MUST NOT appear in it. Where a disposition is not one the application recognises as harmless, the indicator MUST be treated as actionable, so that a new disposition fails towards being seen rather than towards being silently withheld.

A feed MUST carry the handling restriction under which it is shared, because an indicator feed leaves the install and the restriction is what tells the receiver what they may do with it.

#### Scenario: An indicator is recorded as harmless

- GIVEN a case holding an indicator dispositioned as harmless
- WHEN a feed for action is published
- THEN that indicator is not in it

#### Scenario: A disposition the application does not recognise

- GIVEN an indicator carrying a disposition the application does not recognise as harmless
- WHEN a feed for action is published
- THEN the indicator is in it

#### Scenario: A feed is published for sharing

- GIVEN an analyst publishing an indicator feed
- WHEN they choose the handling restriction
- THEN the feed carries it
- AND a receiver can read what they may do with the feed

#### Scenario: A restriction is named for a form that cannot carry one

- GIVEN an analyst asking for a form that carries no handling restriction
- AND naming a restriction anyway
- WHEN the feed is requested
- THEN it is refused
- AND the refusal names the form that cannot carry it
