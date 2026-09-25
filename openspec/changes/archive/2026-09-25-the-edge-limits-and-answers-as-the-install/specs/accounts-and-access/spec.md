# Accounts and access

## MODIFIED Requirements

### Requirement: A session belongs to its holder and ends when it should

A request MUST be served through the session of the caller who made it, never through another's.

A session MUST end after an idle period the install sets, and MUST also end at an absolute lifetime the install sets, whether or not it has been idle. An unattended session that stays busy is still a session nobody is watching.

**Reporting that a session is in use is not a credential attempt, and MUST NOT be limited as one.** A session in use MUST NOT go idle, and its holder's sign-in MUST NOT be refused, because somebody else at the same address reported use or tried to sign in. Analysts behind one address are colleagues, and one address is all a guesser needs to be among them.

An analyst MUST be able to see their own active sessions and end any of them. An administrator MUST be able to end a session, and MUST be able to end every session at once.

**Ending one account's sessions is a verb of the roster**, so it is refused on the account the request is made with; ending *every* session is where an administrator ends their own, and it says so before it runs.

Ending a session MUST take effect immediately, not at its next expiry.

#### Scenario: An administrator ends a session

- GIVEN an analyst with an open session
- WHEN an administrator ends it
- THEN the next request that session makes is refused
- AND anything it had open stops being served

#### Scenario: A session goes idle

- GIVEN a session that has been idle longer than the install permits
- WHEN it makes a request
- THEN it is refused

#### Scenario: Colleagues at one address keep their sessions in use

- GIVEN analysts working behind one address
- WHEN their sessions report use, more often than sign-in is permitted
- THEN another analyst at that address still signs in

#### Scenario: Somebody at an analyst's address guesses at sign-in

- GIVEN an analyst working at an address somebody else is guessing from
- WHEN the guesses are refused as too many
- THEN the analyst's session still reports use

#### Scenario: A session reaches its absolute lifetime

- GIVEN a session in continuous use, never idle
- WHEN it reaches the absolute lifetime the install sets
- THEN it ends
- AND its holder signs in again

#### Scenario: An analyst reviews their own sessions

- GIVEN an analyst signed in from more than one place
- WHEN they look at their own sessions
- THEN each is listed
- AND they can end any of them

#### Scenario: Every session is ended at once

- GIVEN an install with analysts signed in
- WHEN an administrator ends every session
- THEN none of them is served further
