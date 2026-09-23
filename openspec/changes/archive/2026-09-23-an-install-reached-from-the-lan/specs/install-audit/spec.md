# Install audit

## MODIFIED Requirements

### Requirement: A line says who, what, and to what, and never says what was written

A line MUST carry who acted, what they did, what they did it to, and when.

A line MUST carry who acted in a form that survives the account being renamed or removed, because an audit that stops naming somebody once they are deleted cannot answer the question it exists for.

A line MUST NOT carry what was sent. Case content, passwords, passphrases and the bodies of requests MUST stay out of the audit, which is read by people who do not reach the case data the install holds.

Where a line records the address a request came from, it MUST be taken from something the caller cannot set. A caller who can write their own address into the audit can write somebody else's. The address MUST be the one the install's one way in saw the request come from, and a caller that reached the application without passing it MUST be recorded at its own.

#### Scenario: An account is removed after acting

- GIVEN a line recording something an account did
- WHEN that account is removed
- THEN the line still says who did it

#### Scenario: A request carrying a password

- GIVEN a request whose body carries a credential
- WHEN it is recorded
- THEN the body is not in the line

#### Scenario: A caller asserts their own address

- GIVEN a caller presenting an address of their choosing
- WHEN the request is recorded
- THEN the recorded address is not the one they presented

#### Scenario: A caller invents a route

- GIVEN a caller requesting a path the install does not serve
- WHEN the refusal is recorded
- THEN what is recorded is what the install matched
- AND it is not the text the caller sent

#### Scenario: A caller reaches the application without passing the one way in

- GIVEN a caller that reached the application directly, presenting an address of its choosing
- WHEN the request is recorded
- THEN the recorded address is the caller's own
