# Library

## Purpose

An organisation writes the same paragraph in every report, starts every case the same way, and has an opinion about what a report to a regulator must contain. Retyping that is how it drifts.

This spec covers what an install keeps so an analyst does not have to write it again: what a case starts from, how a report is arranged, and the wording an organisation reuses. It covers what ships with the application, what an install may add, and what an operator may turn off.

What a report is and what it owes its audience belongs to the report spec. What a case holds belongs to the collections spec.

## Requirements

### Requirement: An install starts with useful content, and it is recognisable as the application's

An install MUST hold usable content from the moment it is installed, without anybody authoring anything. An empty library makes the first case an authoring exercise.

Content the application ships MUST be distinguishable from content the install wrote. An analyst choosing between two entries MUST be able to tell which came with the application, because it tells them who to ask when it is wrong.

Content the application ships MUST be restored to what it ships as. An install MUST NOT be able to drift into a state where an entry claims to be the application's and is not.

#### Scenario: A newly installed system

- GIVEN an install where nobody has authored anything
- WHEN an analyst starts a case or a report
- THEN there is content to start from

#### Scenario: An analyst chooses between entries

- GIVEN a library holding both shipped and locally written entries
- WHEN an analyst reads the list
- THEN each says which it is

### Requirement: What ships is not edited, and disagreeing with it is done by copying it

An entry the application ships MUST NOT be editable. An install that has edited one has an entry that will be overwritten when the application is upgraded, and nothing will say so.

An install that wants a shipped entry to say something different MUST be able to copy it and edit the copy. The copy MUST be the install's own, and MUST NOT be overwritten by an upgrade.

An install MUST NOT be able to author an entry that takes the name of a shipped one, because two entries answering to one name is how a report gets built from the wrong one.

#### Scenario: An operator edits a shipped entry

- GIVEN an entry the application ships
- WHEN somebody attempts to edit it
- THEN it is refused

#### Scenario: An operator wants a shipped entry to differ

- GIVEN a shipped entry that does not say what the organisation wants
- WHEN the operator copies it and edits the copy
- THEN the copy is theirs
- AND an upgrade does not overwrite it

#### Scenario: A local entry takes a shipped entry's name

- GIVEN an attempt to author an entry under the name of a shipped one
- WHEN it is made
- THEN it is refused

### Requirement: Every kind of library content can be authored, not only chosen

An install MUST be able to author its own entry of any kind the library holds, on the same terms as any other: copied from a shipped one or written new, editable, and its own.

A kind an install may only choose from is a kind whose vocabulary the application has decided on the organisation's behalf. The report spec is explicit that how a report is arranged is content an operator composes rather than vocabulary the application owns, and a library that serves an arrangement without letting anybody write one contradicts it.

#### Scenario: An operator writes a new entry of any kind

- GIVEN any kind of content the library holds
- WHEN an operator authors an entry of that kind
- THEN it is theirs, and offered beside the shipped ones

#### Scenario: An operator arranges a report their own way

- GIVEN a shipped arrangement that does not suit the organisation
- WHEN the operator composes their own
- THEN analysts may start a report from it

### Requirement: An operator can withdraw what ships without deleting it

An install MUST be able to stop offering a shipped entry, so that an organisation is not obliged to offer its analysts a layout it has decided against.

Withdrawing an entry MUST NOT delete it, and MUST be reversible. An operator MUST be able to see what has been withdrawn, because an entry that has silently stopped being offered reads as one the application has lost.

A withdrawn entry MUST NOT be offered where an analyst chooses what to start from.

#### Scenario: An operator withdraws a shipped entry

- GIVEN a shipped entry the organisation has decided against
- WHEN the operator withdraws it
- THEN analysts are not offered it
- AND it is still there, marked as withdrawn

#### Scenario: A withdrawal is reversed

- GIVEN a withdrawn entry
- WHEN the operator restores it
- THEN it is offered again

### Requirement: An install can be given its library as a document, and can read it back

An operator MUST be able to read the whole of one kind of library content out as a single document, and to write one back.

This is what lets an organisation keep its library where it keeps everything else it versions, and put a reviewed change into an install deliberately rather than by clicking through a form. It MUST be an administrative act.

Writing a document back MUST be checked in full before any of it takes effect, so a document with one bad entry does not leave the library half-replaced.

#### Scenario: An operator exports a library

- GIVEN an install's library
- WHEN an administrator reads it out as a document
- THEN the document holds what the install offers

#### Scenario: A document with one bad entry is written back

- GIVEN a document in which one entry is invalid
- WHEN it is written back
- THEN it is refused
- AND the library is unchanged

### Requirement: Content only makes sense where the install has the thing it is for

Where an entry exists to serve something the install may not be doing, it MUST NOT be offered when the install is not doing it.

An install that does not assess against a regulatory regime MUST NOT offer the layouts that exist to report under it. An analyst offered a choice that cannot apply to their case is being invited to make a mistake.

#### Scenario: A layout for a regime the install does not assess

- GIVEN an install not assessing against a regulatory regime
- WHEN an analyst chooses a report layout
- THEN the layouts belonging to that regime are not offered
