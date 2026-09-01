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

What was not found is stated on the archive, and again when it is read, so the gap travels with the file rather than being discovered by whoever opens the case.
