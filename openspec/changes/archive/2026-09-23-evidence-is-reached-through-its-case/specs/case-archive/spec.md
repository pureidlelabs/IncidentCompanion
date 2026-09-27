# Case archive

## MODIFIED Requirements

### Requirement: Reading an archive creates a case; it never overwrites one

Reading an archive MUST produce a new case. It MUST NOT be a way to write into a case that already exists, and MUST NOT be a way to replace one.

Nothing carried by an archive MUST be able to decide what the new case is called internally, who is recorded as having written its rows, what version they are at, or where they came from. An archive is data from outside the install, and letting it name those things would let it collide with, or impersonate, what the install already holds.

Where a row came from MUST be recorded as the archive, rather than as whatever the archive says a row came through on the install that wrote it. A row an analyst typed elsewhere did not arrive here by being typed, and a timeline entry somebody read elsewhere has not been read here — so an archive read in MUST leave its entries marked unreviewed, as any other import does.

The analyst reading the archive in MUST be recorded as having brought it in, so a case that arrived from elsewhere is attributable to the person who put it there.

The new case MUST hold the artefacts the archive carries and nothing else. A digest the archive names and does not carry names something held elsewhere, and MUST NOT reach an artefact this install holds for another case.

#### Scenario: An archive is read in

- GIVEN an archive of a case
- WHEN an analyst reads it in
- THEN a new case exists
- AND no existing case was changed

#### Scenario: An archive names things the install already holds

- GIVEN an archive whose content names rows by the identifiers it was written with
- WHEN it is read in
- THEN the new case's rows are identified by this install's own names
- AND nothing already in the install was reached

#### Scenario: An archive names an artefact it does not carry

- GIVEN an archive whose rows name the digest of an artefact another case holds
- AND the archive does not carry that artefact
- WHEN it is read in
- THEN the new case holds nothing under that digest
- AND nothing the new case produces carries the artefact

#### Scenario: An archive is attributed

- GIVEN an analyst reading an archive in
- WHEN the case is created
- THEN they are recorded as having brought it in

#### Scenario: An archive states where its rows came from

- GIVEN an archive whose rows say they were found by a platform and read by an analyst
- WHEN it is read in
- THEN the new case's rows say they came from an archive
- AND its timeline entries are marked unreviewed
