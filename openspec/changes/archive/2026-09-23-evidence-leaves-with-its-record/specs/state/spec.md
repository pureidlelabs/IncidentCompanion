# State

## MODIFIED Requirements

### Requirement: An artefact is reached only through the case that holds it

An attached artefact MUST be reachable only through the case that stored it. Its digest names the content and never grants it: digests travel by design, in a case's evidence list, in a report's register and in an archive written without its attachments, so naming one from any other case, in a row, a report or an archive read in, MUST reach nothing.

Nothing produced MUST say whether the install holds an artefact another case stored. What a case produces while naming such a digest MUST be what it would produce had nobody ever held the artefact.

The same bytes attached in two cases MUST be held by each on its own, so that neither case's fate reaches the other's and neither is told what the other called the file.

What a case stored MUST leave the install with the case. Bytes MUST leave a case once nothing in it names them: when the evidence record naming them is deleted or comes to name other bytes, unless another of its records still names them or a report it sent was sent with them. Bytes that arrive for no record the case keeps MUST NOT stay either.

Starting an install MUST remove nothing it finds beside it. A database restored from an older copy, rebuilt, or pointed at the wrong directory has no record of bytes that may be the only copy there is, so the install MUST say how many stored artefacts nothing in it names, at start and in its own description, and leave them for an operator.

#### Scenario: A digest is named in another case

- GIVEN an artefact stored in one case
- AND another case, of any customer, naming its digest
- WHEN that other case is archived with its files, or its report is produced or sent
- THEN the artefact is in none of what it produces
- AND nothing produced differs from what a digest nobody holds produces

#### Scenario: Reach is withdrawn from an analyst who read a digest

- GIVEN an analyst who read a case's evidence and then lost reach to it
- WHEN they name its digests in a case of their own
- THEN they are given none of its artefacts

#### Scenario: A handover is read in by somebody who does not reach the case

- GIVEN an archive of a case written without its attachments
- WHEN an analyst who does not reach that case reads it in and archives it with its files
- THEN the archive carries none of the attachments the handover left behind
- AND it does not say the install lost them

#### Scenario: The same artefact is attached in two cases

- GIVEN the same bytes attached in two cases
- WHEN one of the cases is deleted
- THEN the other still holds and serves its own copy
- AND its download names the file as that case named it

#### Scenario: An artefact nothing names any more

- GIVEN bytes an evidence record of a case names
- WHEN the record is deleted, alone or in a selection, or comes to name other bytes
- THEN the bytes are gone from that case
- AND bytes another of its records still names, or another case holds, are kept
- AND every report the case sent still draws each figure it was sent with

#### Scenario: Bytes are attached while a record naming them goes

- GIVEN bytes one evidence record of a case names
- WHEN the same bytes are attached to another of its records as the first is deleted
- THEN the second record's file is still served

#### Scenario: Bytes arrive that no record comes to name

- GIVEN an attachment refused because its record changed while the bytes arrived
- OR an archive carrying bytes none of its records name
- WHEN the attachment is refused, or the archive is read in
- THEN the case holds none of those bytes

#### Scenario: The install starts beside a database that does not hold a case

- GIVEN artefacts a case stored
- AND a database, rebuilt or restored from an older copy, that does not hold the case
- WHEN the install starts
- THEN the case's artefacts are still there
- AND the install says how many stored artefacts nothing names

#### Scenario: The install starts beside a database older than a record

- GIVEN bytes an evidence record of a case named
- AND a database restored from a copy that holds the case but not that record
- WHEN the install starts
- THEN the bytes are still there
- AND the install says how many stored artefacts nothing names
