# Case archive

## Purpose

A case sometimes has to leave the install it was built in: handed to the customer it belongs to, given to a regulator's investigator, moved to the organisation that has taken the work over, or kept somewhere after the install is decommissioned.

This spec covers taking one case out as a single file and reading one back in. Copying the whole install so it can be restored is the state spec, which is a different act with a different purpose: that one recovers an install, this one moves a case.

## Requirements

### Requirement: An archive is one file holding the whole case

An archive MUST be a single file, and MUST hold everything needed to read the case again: the record, the prose as it was written, and the material attached as evidence.

An analyst MUST be able to leave the attached material out, because evidence is what makes an archive large and moving the record alone is often what is wanted.

Where material is left out, or is expected and not found, the archive MUST say so. An archive that is quietly missing evidence is one somebody discovers is incomplete only when they need it.

#### Scenario: A case is archived

- GIVEN a case with prose and attached evidence
- WHEN it is archived
- THEN the archive holds the record, the prose, and the evidence

#### Scenario: An analyst archives without the attachments

- GIVEN a case with attached evidence
- WHEN the analyst archives it without the attachments
- THEN the archive says the attachments were left out

#### Scenario: Expected material is not found

- GIVEN a case whose stored evidence cannot all be found
- WHEN it is archived
- THEN the archive says how much was not found

### Requirement: An archive says what it should contain, and is checked against it

An archive MUST carry a statement of what it holds, and reading one MUST check what is there against that statement before any of it is used.

An archive whose content does not match its own statement MUST be refused. A file that has been damaged in transit, or altered, MUST NOT be read into a case as though it were sound.

#### Scenario: An archive is read

- GIVEN an archive
- WHEN it is read
- THEN each thing in it is checked against what the archive says it should be

#### Scenario: An archive has been altered

- GIVEN an archive whose content no longer matches its own statement
- WHEN it is read
- THEN it is refused

### Requirement: An analyst can seal an archive, and the seal is theirs to hold

An analyst MUST be able to seal an archive so that only somebody holding the secret can read it. An archive leaves the install, and where it goes next is not something the install controls.

The install MUST NOT hold the secret. A seal the install can open protects the archive from everybody except the party most likely to be asked for it.

Sealing MUST be the analyst's choice per archive rather than an install-wide setting, because whether an archive needs a seal depends on where it is going.

Where a secret is too weak to be worth having, it MUST be refused rather than accepted.

#### Scenario: An analyst seals an archive

- GIVEN an analyst archiving a case with a secret of their choosing
- WHEN the archive is produced
- THEN it can only be read by somebody holding that secret

#### Scenario: The install is asked to open a sealed archive

- GIVEN a sealed archive
- WHEN it is read without the secret
- THEN it cannot be opened
- AND the install holds nothing that would open it

#### Scenario: A secret too weak to be worth having

- GIVEN an analyst supplying a secret below what the install accepts
- WHEN they ask for the archive
- THEN it is refused

### Requirement: Reading an archive cannot be made to cost more than the install will spend

An archive is a file from outside the install, and the work of opening one is described by the file itself. An archive MUST NOT be able to describe work the install will perform.

Where an archive declares that opening it costs more than this install would ever produce, it MUST be refused before that work begins rather than after.

The size of what an archive claims to hold MUST be bounded before it is read, so that a small file cannot describe an unbounded amount of content.

#### Scenario: An archive declares more work than the install produces

- GIVEN an archive declaring a cost to open higher than this install ever writes
- WHEN it is read
- THEN it is refused before the work is done

#### Scenario: An archive describing more content than the install accepts

- GIVEN an archive claiming to hold more than the install accepts
- WHEN it is read
- THEN it is refused

### Requirement: Reading an archive creates a case; it never overwrites one

Reading an archive MUST produce a new case. It MUST NOT be a way to write into a case that already exists, and MUST NOT be a way to replace one.

Nothing carried by an archive MUST be able to decide what the new case is called internally, who is recorded as having written its rows, or what version they are at. An archive is data from outside the install, and letting it name those things would let it collide with, or impersonate, what the install already holds.

The analyst reading the archive in MUST be recorded as having brought it in, so a case that arrived from elsewhere is attributable to the person who put it there.

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

#### Scenario: An archive is attributed

- GIVEN an analyst reading an archive in
- WHEN the case is created
- THEN they are recorded as having brought it in
