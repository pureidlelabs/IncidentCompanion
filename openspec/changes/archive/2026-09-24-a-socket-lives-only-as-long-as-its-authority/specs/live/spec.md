# Live

## MODIFIED Requirements

### Requirement: The connection dies with the reach that admitted it

Reach withdrawn while an analyst is connected MUST end the connection. A connection admitted once MUST NOT outlive the reach that admitted it.

This covers every way reach ends: the session ended, the group revoked, the customer moved, the account disabled at the identity provider, the case deleted. A connection acts only while the session that opened it would be served an ordinary request now, so a session whose window has closed, or whose account must change its password or no longer exists, ends its connections too, whether or not they are sending anything.

Ending one session MUST end only the connections that session opened, so an analyst connected from two places keeps the other.

A refusal over a connection MUST be recorded as the same refusal of an ordinary request is.

A connection MUST be carried over the same protected transport every other request uses. There is no plain connection, and no setting that permits one.

#### Scenario: Reach is withdrawn mid-session

- GIVEN an analyst connected to a case
- WHEN the reach that admitted them is withdrawn
- THEN the connection ends
- AND they stop receiving anything about that case

#### Scenario: The case is deleted underneath a connection

- GIVEN analysts connected to a case
- WHEN it is deleted
- THEN their connections end
- AND nothing further about it reaches them

#### Scenario: A session ends while its connection is silent

- GIVEN an analyst connected to a case who sends nothing
- WHEN the session's window closes
- THEN the connection ends

#### Scenario: An account is held while connected

- GIVEN an analyst connected to a case
- WHEN an administrator resets their password and holds the account
- THEN nothing more they send is acted on
- AND the connection ends

#### Scenario: An analyst signs out in one of two places

- GIVEN an analyst connected to one case from two places
- WHEN they sign out in one
- THEN that place's connection ends
- AND the other keeps working

#### Scenario: A connection is refused an edit

- GIVEN a read-only analyst connected to a case
- WHEN they try to edit over the connection
- THEN it is refused
- AND the refusal is recorded as a refused request is

