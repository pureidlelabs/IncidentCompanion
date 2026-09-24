# The API

## MODIFIED Requirements

### Requirement: Reach is enforced where the data is, not where the request arrives

Whether a caller may see a row MUST be enforced by the store that holds it, so that a request the interface did not anticipate cannot reach a row the caller may not see.

An entry-point check is necessary and MUST NOT be the only one. Where a caller can compose the shape of its own request, an entry-point check protects the shapes somebody thought of.

#### Scenario: A caller composes a request nobody anticipated

- GIVEN a caller that can shape its own request
- WHEN it asks for rows across a boundary it may not cross
- THEN the store returns nothing it may not see
- AND the refusal does not depend on the interface having expected that request

#### Scenario: A new way to read a record is added

- GIVEN a record already protected by reach
- WHEN a further way to read it is added to the interface
- THEN it is protected without anybody adding a check
- AND omitting the check is not something a reviewer must catch

#### Scenario: A route forgets to ask

- GIVEN a route that asks nothing about reach before it serves a case
- WHEN a caller asks it for a case whose customer they do not reach
- THEN none of that case is served
- AND nothing is written into it

#### Scenario: A route forgets to ask before it writes

- GIVEN a route that asks nothing about reach before it writes into a case
- WHEN a caller writes into a case whose customer they do not reach
- THEN nothing is written
- AND they are answered as though the case were not there
