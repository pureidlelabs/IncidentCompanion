# Scope

**A shipped entry is never edited, only copied.** An edited shipped entry is one an upgrade overwrites with nothing saying so.

**Withdrawing is not deleting**, and it is reversible. An entry that has silently stopped being offered reads as one the application has lost.

**Every kind is authorable.** A kind that can only be chosen from is one whose vocabulary the application has settled on the organisation's behalf, and the report spec already places that decision with the operator.

**The library holds wording and arrangement, never case content.** Nothing in it is specific to an incident.

# Design

## Shipped entries are re-asserted rather than seeded once

What the application ships is written into the library on every start, keyed on what it is called. An install cannot drift into holding a modified copy that still claims to be the application's.

That is also why they cannot be edited: an edit would be silently reverted at the next start, which is worse than refusing it.

## Copying is how an install disagrees

An install wanting different wording copies the entry and edits the copy. The copy is the install's own and no upgrade touches it.

**A local entry may not take a shipped entry's name.** Two entries answering to one name is how a report gets built from the wrong one, and the collision is refused at the moment of authoring rather than resolved at the moment of use.

## Withdrawal is install-wide and visible

An operator can stop an entry being offered without removing it. It stays in the list, marked, so an operator can see what they have turned off — and so the next administrator does not conclude the application has lost it.

A withdrawn entry is not offered anywhere an analyst chooses what to start from.

## The whole of a kind can move as one document

A library can be read out and written back as a single document. This is what lets an organisation keep its wording where it keeps everything else it versions, and land a reviewed change deliberately rather than by clicking through a form.

**A document is validated in full before any of it applies.** A partially applied document leaves the library in a state nobody authored, and the operator's file is then no longer a description of the install.

## What the install is not doing is not offered

An entry existing to serve a regulatory regime is not offered by an install that does not assess against it. An analyst offered a choice that cannot apply to their case is being invited to make a mistake, and then to wonder why the result is empty.
