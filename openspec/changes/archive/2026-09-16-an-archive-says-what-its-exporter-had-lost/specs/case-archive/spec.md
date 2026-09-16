# Case archive

## MODIFIED Requirements

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
