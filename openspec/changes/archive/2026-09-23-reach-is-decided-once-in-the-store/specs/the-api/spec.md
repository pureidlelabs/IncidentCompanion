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

### Requirement: A refusal says which of the caller's problems it is

A refusal MUST distinguish: the caller is not who it says, the caller may not do this, the request is malformed, the thing is not there, somebody wrote first, and the caller is asking too often.

A refusal MUST NOT disclose the existence of something the caller may not reach. Not there and not yours MUST be indistinguishable.

A refusal is a reference entry for somebody writing a client. It names the condition and the field that discriminates it, and offers no advice.

#### Scenario: A caller asks for something out of reach

- GIVEN a caller without reach to a customer
- WHEN it asks for one of that customer's cases, by an identifier that exists
- THEN the refusal is identical to one for an identifier that does not

#### Scenario: A caller sends a body the interface cannot accept

- GIVEN a malformed request
- WHEN it is refused
- THEN the refusal names what was wrong with it

#### Scenario: A caller times the refusal

- GIVEN a caller without reach to a customer
- WHEN it measures how long the refusal of one of that customer's cases takes
- THEN it takes the work the refusal of an identifier that does not exist takes

#### Scenario: A write depends on another customer's data

- GIVEN a caller who does not reach a customer
- WHEN a write it makes would depend on what that customer holds
- THEN the answer is the same whatever that customer holds
