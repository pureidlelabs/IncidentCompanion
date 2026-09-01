# Scope

**A file is a collection, not a case.** One table in, one table out. Moving a whole case is the case archive.

**The application's own export is the format.** There is no separate interchange schema to keep in step with the collections; the columns are the collection's own, so a new field exports without anybody being asked.

**Neutralising a formula does not edit the analyst's value.** What is written to the file is protected; what comes back is what the analyst recorded. Evidence must survive a round trip through a spreadsheet unchanged.

**Nothing is sanitised beyond what would execute.** A value that is merely alarming is stored as it arrived. This application records what an attacker did, and rewriting hostile-looking text would destroy the record it exists to keep.

**An indicator feed goes out; nothing comes back in.** There is no ingest of somebody else's feed, and no reputation lookup — that would be an outbound request Article V does not permit.

# Design

## The formula guard, and why it is applied twice

A spreadsheet treats a cell beginning with certain characters as a formula, and case data begins with them constantly — a negative number, an email address, a command line.

The guard prefixes such a value so the spreadsheet reads it as text. The prefix is added even to a value that already carries one, because some spreadsheets strip a layer on save: an export opened, saved, and re-exported would otherwise come back live.

**The trim happens before the test.** Leading whitespace, and characters that are not visible at all, would otherwise carry a formula past a check that only looks at the first character.

**The import removes the guard.** The analyst's value is what is stored, so a round trip is lossless and evidence is not slowly rewritten by the act of exporting it.

## Invisible characters are removed on the way in

Direction overrides and zero-width characters make a stored value display as something other than what it is — to a person reading a screen, but not to anything comparing strings.

They are removed where a value is interpreted rather than escaped where it is drawn, because escaping at every drawing site is a list nobody keeps complete.

## Unknown columns are refused; the application's own are ignored

These look contradictory and are not.

A column the collection does not have is a mistake — a misspelled field, a file from the wrong collection — and guessing at it writes the wrong thing silently.

A column the application owns is different: it appears in the application's own export, and refusing it would mean an export could not be imported. Ignoring those is what makes the round trip work without a separate export mode.

## All or nothing

An import runs as one transaction. A file half-imported leaves the analyst working out what already went in before they can fix and retry, and the fix is then a different file from the one they were given.

## Replace obeys the version check

Replacing an existing row is an ordinary write and takes the ordinary version check. A row somebody has changed since the file was produced is refused rather than overwritten.

**Refused and skipped are reported separately**, because they mean opposite things: skipped is the instruction being obeyed, refused is a collision the analyst has to look at.

## Only some collections can be deduplicated

A collection whose rows are things has an identity to match on. A collection whose rows are events does not, and two identical events are two events — deduplicating them would silently discard a real observation.

## What the feed carries

A feed meant for action carries what a defender would act on, so a disposition recorded as harmless is left out.

**The exclusion is a closed list and the inclusion is not.** A disposition the application does not recognise is treated as actionable. The failure then is an analyst seeing something they will dismiss, rather than an indicator silently withheld from a blocklist because somebody added a disposition and did not update a filter.

**The handling restriction rides with the feed.** The feed leaves the install, and the restriction is the only thing telling the receiver what they may do with it. A form that cannot carry one refuses to be given one rather than accepting it and dropping it.
