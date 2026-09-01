# Scope

**A file is a collection, not a case.** One table in, one table out. Moving a whole case is the case archive.

**The application's own export is the format.** There is no separate interchange schema to keep in step with the collections; the columns are the collection's own, so a new field exports without anybody being asked. A reference column is the exception, and it carries what the row points at rather than where that row was kept.

**A file moves between cases, not only out of one and back.** Export from one case and import into another is an ordinary workflow, and the format answers to it rather than treating it as misuse.

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

## Two kinds of key, which must never be merged into one

This is the distinction the whole reference design rests on, and the two look alike enough that somebody will eventually try to unify them.

**A deduplication identity answers "are these the same fact?"** It decides whether an incoming row is one the case already holds. Some collections deliberately have none: an analyst's method and a piece of evidence are a judgement and an event rather than a thing, so two that look alike are two facts and merging them destroys one of them. Running the same query twice is two investigative acts.

**A portable reference key answers "which row did the source mean?"** It decides what a reference resolves to in the case a file lands in. It says nothing about whether two rows are the same fact.

**Every collection that can be pointed at needs the second. Only some should have the first.** A method keys portably on its name and an attachment on the digest of its content — enough to say which one a reference meant, and no claim at all that two methods sharing a name are one method.

Collapsing them would import the deduplication argument into a place it does not apply, and conclude that a reference to a method cannot travel. It can; it just must not merge anything on arrival.

## Where a reference resolves, and what happens when it does not

Resolution happens against the destination case. Importing back into the case a file came from resolves to the same rows; importing into a case that holds the same host resolves to that case's host, which is the point.

**The place a row was stored is not a reference and is never read as one.** A file that could name a row by where it lives would be a way to reach a case the importing analyst may not, which is the case boundary broken by a file rather than by a request.

**An unresolved reference writes the row bare rather than refusing it.** A file describing things the destination does not hold is an ordinary import, not an error, and refusing it would block moving a timeline into a case whose hosts have not been recorded yet.

**What must not happen is the silence.** A dropped reference nobody is told about produces a case whose gaps are found later by somebody who cannot tell whether the connection was never made or was lost on the way in.

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
