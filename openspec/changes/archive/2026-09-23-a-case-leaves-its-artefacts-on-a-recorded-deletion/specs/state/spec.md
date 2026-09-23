# State

## MODIFIED Requirements

### Requirement: An artefact is reached only through the case that holds it

An attached artefact MUST be reachable only through the case that stored it. Its digest names the content and never grants it: digests travel by design, in a case's evidence list, in a report's register and in an archive written without its attachments, so naming one from any other case, in a row, a report or an archive read in, MUST reach nothing.

Nothing produced MUST say whether the install holds an artefact another case stored. What a case produces while naming such a digest MUST be what it would produce had nobody ever held the artefact.

The same bytes attached in two cases MUST be held by each on its own, so that neither case's fate reaches the other's and neither is told what the other called the file.

What a case stored MUST leave the install with the case. Bytes a case holds that none of its evidence records says it holds, and that no report it sent was sent with, MUST NOT outlive the next start.

A database that does not hold a case MUST NOT be read as that case's deletion. A database rebuilt, or restored from an older copy, beside the artefacts would otherwise remove what it was restored to find: what a case stored leaves the install when the install records the case's deletion, or when demonstration content is removed.

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

- GIVEN bytes a case holds whose evidence record was deleted or now names other bytes, and which no report the case sent was sent with
- WHEN the install next starts
- THEN they are gone
- AND every report the case sent still draws each figure it was sent with

#### Scenario: The install starts beside a database that does not hold a case

- GIVEN artefacts a case stored
- AND a database, rebuilt or restored from an older copy, that does not hold the case and records no deletion of it
- WHEN the install starts
- THEN the case's artefacts are still there
