# The API

## MODIFIED Requirements

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

#### Scenario: A caller removes something that is not there

- GIVEN a record that does not exist, and one in another case
- WHEN a caller removes either through a case it writes
- THEN both are refused as not there rather than as somebody having written first
- AND the two refusals are identical

#### Scenario: A caller removes something another has changed

- GIVEN a record changed since the caller read it
- WHEN the caller removes it at the version it read
- THEN it is refused as somebody having written first, naming the version the record holds
