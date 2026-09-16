# Case archive

## ADDED Requirements

### Requirement: Reading an archive says how complete the case it made is

Reading an archive MUST tell the operator how much of what the new case names is in it: the attachments its rows name that the archive did not carry, and the rows its rows name that it does not contain.

Neither MUST be presented as a fault in the archive, and neither MUST refuse the read. An archive is written without its attachments deliberately, and a reference list keeps the id of a row an analyst deleted — so a sound archive of a real case carries both. What the operator is told is what is true whichever cause produced it: this case names things that are not in it.

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
