# accounts-and-access

## ADDED Requirements

### Requirement: A verb the roster offers is refused on the account performing it

An administrator manages other people's accounts from the roster. Disabling an account, ending the sessions it holds, and changing its role MUST be refused where the account named is the one the request is made with, and the refusal MUST say that it is.

Each is irreversible from where it leaves the caller. Disabling stops the next sign-in; ending the sessions revokes the one the request arrived on, so the answer is returned to a caller who no longer exists; changing the role takes away the reach that makes the roster reachable, and the door that grants a role is the one they have just left. None of the three has an undo the person performing it can reach.

The refusal MUST be at the route rather than only at the screen. A screen that leaves a control off is a courtesy to whoever is reading it, and a caller reaching the route directly is not reading it.

**Setting the role an account already holds is not a change** and MUST NOT be refused: it writes nothing and takes nothing away.

**This says nothing about what an administrator may do to anybody else**, and nothing about what they may grant themselves. The power to manage an install is still the power to use it, the record is still the answer to that, and no rule here protects one person from another.

**Two doors remain, and they say what they cost first.** Ending every session at once ends the caller's own with everybody else's, which is what that act is for, and it is confirmed before it runs. Changing an administrator's role is another administrator's to do.

#### Scenario: An administrator ends their own sessions from the roster

- GIVEN an administrator signed in
- WHEN they end the sessions of the account they are signed in with
- THEN it is refused
- AND the session the request was made with is still served

#### Scenario: An administrator changes their own role

- GIVEN an administrator, and another administrator on the install
- WHEN they set their own account to a different role
- THEN it is refused
- AND their role is unchanged

#### Scenario: An administrator sets the role their account already holds

- GIVEN an administrator
- WHEN they set their own account to the role it already holds
- THEN it is accepted, having changed nothing

#### Scenario: The same verbs on somebody else

- GIVEN an administrator and another account
- WHEN they change that account's role, or end its sessions
- THEN each is performed

## MODIFIED Requirements

### Requirement: A session belongs to its holder and ends when it should

A request MUST be served through the session of the caller who made it, never through another's.

A session MUST end after an idle period the install sets, and MUST also end at an absolute lifetime the install sets, whether or not it has been idle. An unattended session that stays busy is still a session nobody is watching.

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
