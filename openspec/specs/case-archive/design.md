# Scope

**An archive moves a case; a copy of the store recovers an install.** They are different acts and neither substitutes for the other. The state spec owns the second.

**Reading an archive always creates a case.** There is no merge into an existing one, and no restore-over. An archive is data from outside the install and is never allowed to reach something already in it.

**Sealing is per archive and the install holds no key.** Whether to seal depends on where the archive is going, which the install does not know.

**An archive from another install opens**, given the secret. Nothing binds an archive to the install that wrote it, because moving a case between installs is the point.

**Evidence may be left out**, and what is missing is stated rather than discovered later.

# Design

## The archive states what it holds, and the statement is checked

Every member is listed with a digest, and reading checks each one before it is used. A file damaged in transit, or altered, is refused rather than read into a case as though sound.

## The seal is the analyst's, and the install cannot open it

Sealing derives a key from a secret the analyst supplies. Nothing about the secret is stored, so an install compelled to produce what it holds produces an archive it cannot open.

A secret below a length worth having is refused rather than accepted, because a seal that can be guessed is worse than none: it reads as protection.

## Opening cost is declared by the file, so it is bounded before it is paid

The work of deriving a key from a secret is described in the archive's own header, by whoever wrote it. An archive from outside the install could therefore ask this install to perform an arbitrary amount of work.

**An archive declaring more work than this build ever writes is refused before the work starts.** The check is on the header rather than after decryption, which is what makes it a bound rather than a report.

The consequence is deliberate: an archive this build produced always opens, and one costing more than it ever produces never runs. An older archive costing less opens fine.

## What an archive names is never what the new case uses

Reading an archive mints new identifiers for everything and maps the references across as it goes. Nothing carried in the file decides what a row is called here.

Taking the archive's identifiers would let a file name something the install already holds — colliding with it, or reaching it.

**Versions restart and attribution is the importer's.** The row's history belongs to the install it happened in. Carrying the original attribution across would assert that somebody wrote a row on an install they may never have used.

## Missing evidence is recorded rather than fatal

Evidence is stored beside the record rather than in it, so an export can find the record and not the bytes. Refusing the whole archive would mean a case with one lost attachment cannot be moved at all.

What was not found is stated on the archive, and again when it is read, so the gap travels with the file rather than being discovered by whoever opens the case. Stating it only in the response that carried the download is not stating it on the archive: that answer lasts for one download, and an analyst who saved the file or was handed it opens one that looks complete.

**The statement is optional and the archive version does not move for it.** An archive written before it existed carries nothing and reads as reporting none, which is what it meant. Moving the version would refuse every archive an install already holds, in exchange for a statement those archives were never able to make.

## What the exporting install lost is relayed, never recomputed

An evidence row arriving without its bytes looks identical whichever cause produced it, so a count derived from the digests that did arrive can only answer *how many files are absent*. The manifest is the one place the difference is written down, and it is written by the install that knew.

**Not subtracted from the absent count, and not in the same unit as it.** An artefact the exporting install lost is still an attachment the rows name and the archive did not carry, so taking it out would make that count answer a narrower question than its sentence claims. The two are counted differently, though: the archive states one entry per artefact and the absent count is of rows, so one lost file that two rows name reads as two absent and one lost. What the operator is told names each unit rather than reconciling them, because the archive carries no way to map its statement back to the rows.

**The statement is relayed as the archive makes it.** Its shape is checked and its content is not cross-checked against the file list or the rows, so an archive somebody edited states whatever they wrote into it — which is the same standing as every other field a manifest carries.

**The reader hands out what it proved.** The manifest is validated on the way in — its version, its file list, its statement of what travelled and of what was not found — so a caller parsing those same bytes a second time reads a value nothing has checked, and is safe only while the first parse happens to have run.

## How connected the case is, told without claiming the file is damaged

A dangling id in a reference list is the ordinary state of a case rather than damage. Those lists are `jsonb` and nothing scrubs them when a row is deleted, so a sound export of a case an analyst has tidied carries ids that resolve to nothing. A count presented as *the archive lost these* would be wrong for the common case and would teach an operator to ignore it.

What is true whichever cause produced it is that the case names rows that are not in it, and that is what the operator is told: as a warning beside what arrived, never as a refusal, and never as a statement about the file.

**Rows, counted once each, not links.** One deleted row named by two entries is one row the case is missing. Counting occurrences answers how many links broke, which is a different question and not the one the sentence asks.

**Counted where the drop happens.** The remap is the only place an id fails to resolve, and it already separates the two shapes: a list is filtered, a scalar becomes null. A pass afterwards would have to re-derive which columns are references and would answer what the case holds now rather than what the archive asked for and did not get.

**Scalars are counted and are expected to be zero.** Every scalar reference is a foreign key with `on delete set null`, so a deleted row leaves null rather than a dangling id. One that does dangle came from a hand-written archive or an install whose schema differs.

**Two things this count deliberately excludes**, because neither is a row the case names and lacks:

- A reference field this install has no column for. The referenced row may well be in the archive; what is missing is the column, so counting it would make the sentence false. It is the other-build case, and what it wants is its own answer about fields dropped rather than rows.
- Prose carried for a report the archive does not describe. That is content arriving for a row that does not exist, the mirror of the attachment count rather than an instance of this one. It is logged where it happens.
