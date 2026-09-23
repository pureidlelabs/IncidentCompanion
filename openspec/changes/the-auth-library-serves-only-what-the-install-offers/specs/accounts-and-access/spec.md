# Accounts and access

## ADDED Requirements

### Requirement: An install serves only the account operations it offers

An account operation MUST be reachable over the network only where a requirement in this specification offers it. The authentication mechanism an install is built on may define more — changing an address, deleting an account, linking another provider, an administrator's own shortcuts — and every one no requirement offers MUST NOT exist to a caller, whoever asks, at any role, signed in or not.

The refusal MUST be the one for a route that never existed. An answer that differs from it says the operation is there and is merely refused, which is the first thing somebody probing an install wants to know.

An operation MUST NOT be reachable through a second spelling of a route the install does not offer: a change of case, a trailing separator, an encoded character or a doubled one.

An account that must change its password MUST reach, of these operations, only reading its own session, signing in and signing out. Everything else it is offered waits until it has changed its password.

An account MUST NOT change its own display name. The name is how every change the account makes is attributed on screen, and a name its holder chose — another account's included — would let them write as somebody else.

#### Scenario: A caller asks for an account operation the install does not offer

- GIVEN an install
- WHEN anybody, at any role and signed in or not, asks for an account operation no requirement offers
- THEN the answer is the one for a route that never existed
- AND nothing about any account changes

#### Scenario: An operation is asked for by another spelling

- GIVEN an account operation the install does not offer
- WHEN somebody asks for it with its route spelled differently
- THEN the answer is the one for a route that never existed

#### Scenario: A held account asks for an operation the install offers

- GIVEN an account that must change its password
- WHEN it asks for any offered account operation other than reading its own session, signing in or signing out
- THEN it is refused, and told that it must change its password

#### Scenario: An analyst takes another account's name

- GIVEN an analyst and another account with a display name of its own
- WHEN the analyst asks to take that name
- THEN it is refused
- AND the analyst's display name is unchanged

## MODIFIED Requirements

### Requirement: Administrative events are logged

An administrative event is anything that changes who can reach what, or changes how the install decides that. Each MUST be logged with who did it, what it affected, and when.

Reaching the install and being refused reach are events too. Every sign-in MUST be logged, successful or not, with how it was attempted — locally or through the provider — and a refused reach to a customer or a case MUST be logged with who was refused and what they were refused. A failed sign-in and a refused reach are the two things an investigation into this application's own misuse starts from.

**The record is append-only, and nobody may edit it.** An entry once written MUST NOT be changed or removed by anybody, through any path, at any level of privilege. An administrator MUST NOT be able to edit the record of what administrators did, because a record its subject can rewrite is not a record.

Entries MUST leave only by the retention this specification requires, and that leaving MUST itself be recorded: what was pruned, how much, and under which period.

**Reading the record is itself controlled.** The log names who reached which customer's cases, so it is not less sensitive than what it describes. Reaching it MUST require reach, and reaching it MUST be logged.

**Logging cannot be turned off.** What an install configures is where the record goes and how long it is kept, never whether it is made. An administrator who could pause it could grant themselves reach, read an investigation, withdraw the reach and resume it, leaving a trail of two settings changes and nothing between them.

**Where the record cannot be written, what happens depends on what was being attempted, and every case MUST have an answer.**

Anything that *changes* state MUST be refused: an administrative act, a change to a case, a grant, a reset. An unrecordable change is indistinguishable from a suppressed one, so it does not happen.

Anything that *refuses* MUST still refuse. Refusing to refuse is incoherent — it would turn a log outage into an open door — so the refusal stands and the failure to record it becomes the install's problem rather than the caller's.

**Signing in MUST be refused** while authentication cannot be recorded. An install that admits people it cannot account for is worse than one nobody can sign in to, and the way back in is the recovery credential, whose use is recorded by the same mechanism and fails the same way.

In every case where the record could not be written, the install MUST report itself unwell and MUST say that its record has a hole and where. An install that carries on quietly has lost the property the log exists for.

That is: creating, changing or removing an account; making somebody an administrator or ceasing to; creating, changing or removing a group, or what customers it holds; adding somebody to a group, removing them, or changing their level; locking or unlocking an account; ending a session; resetting somebody's second factor; turning the second-factor policy on or off; configuring, changing or removing federation; adding, changing or removing a provider group mapping; issuing a new recovery credential, using one, or failing to.

Changing what the logging itself does is an administrative event.

#### Scenario: Somebody is given reach

- GIVEN an administrator adding an analyst to a group
- WHEN the membership is made
- THEN it is logged with the administrator, the analyst, the group, the level and the moment

#### Scenario: Somebody signs in

- GIVEN an analyst signing in, locally or through the provider
- WHEN the attempt succeeds or fails
- THEN it is logged with who, when, and how it was attempted

#### Scenario: Somebody is refused a customer

- GIVEN an analyst requesting a case for a customer they do not reach
- WHEN the request is refused
- THEN the refusal is logged with who was refused and what they asked for

#### Scenario: An administrator attempts to pause the record

- GIVEN an administrator
- WHEN they attempt to stop administrative events being logged
- THEN it is refused
- AND the attempt is logged

#### Scenario: A change cannot be recorded

- GIVEN an install whose log destination is unavailable
- WHEN anybody attempts an administrative act, or a change to a case
- THEN it is refused
- AND they are told the record could not be made

#### Scenario: A refusal cannot be recorded

- GIVEN an install whose log destination is unavailable
- WHEN somebody is refused reach to a customer
- THEN they are still refused
- AND the install reports that its record has a hole

#### Scenario: A sign-in cannot be recorded

- GIVEN an install whose log destination is unavailable
- WHEN somebody attempts to sign in
- THEN it is refused

#### Scenario: An entry is edited

- GIVEN a written log entry
- WHEN anybody, at any privilege, attempts to change or remove it
- THEN it is refused

#### Scenario: The record is read

- GIVEN somebody reading the log
- WHEN they do
- THEN reaching it required reach
- AND the reading is itself recorded

#### Scenario: Where the record goes is changed

- GIVEN an administrator
- WHEN they change the log's destination or how long it is kept
- THEN the change is itself logged, at both the old destination and the new

#### Scenario: An analyst ends their own session

- GIVEN an analyst signed in from more than one place
- WHEN they end one of their own sessions, or every other one
- THEN each ending is logged with who ended it, whose sessions they were, and the moment
