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

### Requirement: Reading an archive says how complete the case it made is

Reading an archive MUST tell the operator how much of what the new case names is in it: the attachments its rows name that the archive did not carry, and the rows its rows name that it does not contain.

Where the archive states that the install which wrote it recorded material and could not find it, reading MUST tell the operator that apart from what the archive was written without. Material left out on purpose is still held by whoever exported it; material the exporting install had lost is held by nobody, and an operator told only that a file is absent asks the sender for a copy that does not exist.

None of it MUST be presented as a fault in the archive, and none of it MUST refuse the read: a sound archive of a real case carries them. What the operator is told is what is true whichever cause produced it — this case names things that are not in it.

This MUST reach the operator rather than only the response. A count the interface does not draw tells nobody.

#### Scenario: An archive carries rows that name what it left behind

- GIVEN an archive written without its attachments
- WHEN an operator reads it in
- THEN they are told how many attachments the rows name that the archive did not carry
- AND the case is created

#### Scenario: A case names a row that is not in it

- GIVEN a case whose rows name a row that was deleted before it was archived
- WHEN an operator reads the archive in
- THEN they are told how many rows the case names that are not in it
- AND the case is created

#### Scenario: The exporting install had lost material the case records

- GIVEN an archive written with its attachments, whose install could not find one the case records
- WHEN an operator reads it in
- THEN they are told the install that wrote the archive had already lost it

#### Scenario: An archive written without its attachments claims no loss

- GIVEN an archive written without its attachments
- WHEN an operator reads it in
- THEN they are told nothing was lost by the install that wrote it

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

### Requirement: An archive is refused where its reference is already held

Reading an archive MUST be refused where the case reference it carries is already held by another case within the same customer, and the refusal MUST name the case holding it.

A reference identifies the customer's own record of the incident, so two cases carrying one reference leave no answer to which of them that record refers to. The refusal MUST leave the install unchanged, and MUST NOT depend on which door the archive arrived through.

An archive read into an install that does not hold the reference is unaffected, which is the handover between installs the format exists for.

#### Scenario: The install still holds the case the archive was made from

- GIVEN a case carrying a reference
- WHEN an archive of it is read into the same install
- THEN it is refused
- AND the analyst is told which case already holds that reference
- AND no case is created

#### Scenario: The reference is free

- GIVEN an install holding no case with the archive's reference
- WHEN the archive is read
- THEN the case is created carrying that reference

#### Scenario: The archive carries no reference

- GIVEN an archive of a case with no reference
- WHEN it is read into an install already holding cases with no reference
- THEN it is created, because the absence of a reference is not a value

### Requirement: An archive's rows are checked against what this install can hold

An archive matching its own statement MUST NOT be read as though its rows were sound. A statement covers what the file carries; it says nothing about whether the rows inside are ones this install can mean.

Every row MUST be checked against the shape its collection declares, before any row is written. A value of a shape the field does not take MUST be refused rather than stored, and where a field's terms are fixed, a term outside them MUST be refused too.

What the check can refuse is what the collection states. A field whose terms are published as guidance rather than fixed in its shape is open at every door, and an archive is not the place to close it.

An archive carrying a row this install cannot hold MUST be refused whole, and MUST leave nothing of that archive behind. A case written in part is worse than no case: it looks sound, and the operator has no way to tell which rows were reached.

The refusal MUST name the collection it stopped at, in the words the application uses for it, rather than reporting how the store failed. An operator meeting the store's own words is told about columns they did not write and cannot act on.

A field this install does not know MUST be dropped rather than refused, so that an archive written by another build of this application still reads for what the two have in common.

#### Scenario: An archive states a term outside a fixed set

- GIVEN an archive whose statement is sound
- AND a row in it carrying a term outside the fixed set its field declares
- WHEN it is read
- THEN it is refused
- AND the term is not stored

#### Scenario: An archive states a value of the wrong shape

- GIVEN a row naming a thing with a value of a shape that field does not take
- WHEN the archive is read
- THEN it is refused
- AND nothing is stored in that field's place

#### Scenario: An archive states a value the store cannot hold

- GIVEN a row carrying a value no column can hold
- WHEN the archive is read
- THEN it is refused naming the collection
- AND the operator is not shown how the store failed

#### Scenario: An archive is refused after some of its rows were sound

- GIVEN an archive whose first rows are sound and whose later ones are not
- WHEN it is read
- THEN it is refused
- AND no case is left behind

#### Scenario: An archive carries a field this install does not know

- GIVEN an archive written by another build of this application
- AND a row in it carrying a field this install has no place for
- WHEN it is read
- THEN the field is dropped
- AND the rest of the row is read

#### Scenario: An archive leaves a column out

- GIVEN an archive that states nothing for a column this install has
- WHEN it is read
- THEN the column keeps the value the install would give it
- AND the row does not gain a value the archive never stated
