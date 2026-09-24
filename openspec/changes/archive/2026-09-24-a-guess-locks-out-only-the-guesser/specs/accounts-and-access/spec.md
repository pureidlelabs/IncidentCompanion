# Accounts and access

## MODIFIED Requirements

### Requirement: Authentication resists guessing, and says so to the auditor

This requirement governs local accounts. An account whose credentials belong to an identity provider is guarded there, and this install MUST NOT duplicate it.

Sign-in MUST resist repeated guessing, and guessing MUST NOT give anybody the power to lock an account's holder out. A local account's failures MUST count against the account in two runs: one for the addresses the account's right password has come from, and one for every other address. When a run reaches a number of failures the install sets, the addresses that run counts for MUST be locked out of the account, and the addresses of the other run MUST NOT be.

The first lock MUST last a duration the install sets. Each later lock of the same run, with no right password between them, MUST last longer than the one before, up to a maximum the install sets, and a lock that has lifted MUST take the install's number of failures to fall again. The same wrong password offered again MUST count once. The install MUST NOT keep a wrong password, nor anything from which one could be confirmed without the install's own secret. An administrator MUST be able to release an account, and a release MUST clear both runs.

**Every door that checks a password is a door a guess arrives through.** A wrong password MUST count toward the lock whichever door checked it — signing in, confirming the current password before changing it, or any other — and the failures from every door MUST count into the same two runs. While an address is locked out of an account, the account's password offered from it MUST be answered as wrong at every door, and nothing a door would do with the right one — signing in, replacing the password — MUST happen. Each wrong answer MUST be logged as a failed sign-in, naming the door, and each lock MUST be logged once, when it falls, with how long it lasts.

Local passwords MUST meet a policy the install sets. Where a password must be changed, the holder MUST be unable to reach anything else until they change it.

A policy the install sets MUST govern every door that writes a password, including any the authentication library serves itself, and MUST take effect without a restart. A bound read when the process started is one an administrator cannot raise, and a control that records a change it does not apply is worse than one that was never offered.

The policy MUST govern what may be written and never what may be offered. Raising the minimum MUST NOT refuse a password already in use, or the change locks out every account holding a shorter one.

These controls exist to answer OWASP ASVS 5.0 Level 2, which the constitution names as the grounding, and this requirement is the documentation of how they are configured and how they keep a guesser from locking somebody else out.

#### Scenario: Repeated failures lock an account

- GIVEN an account
- WHEN sign-in fails from one address as many times as the install permits
- THEN that address is locked out of the account
- AND further correct credentials from it do not sign it in until the lock lifts

#### Scenario: A locked account reveals nothing

- GIVEN an account an address is locked out of
- WHEN somebody at that address attempts to sign in
- THEN the response does not distinguish a locked account from a wrong password

#### Scenario: Another machine guesses at an analyst's account

- GIVEN an analyst who has signed in from their own machine
- WHEN another machine guesses at their account until it is locked out
- THEN the analyst signs in from their own machine
- AND the guessing machine is refused the right password

#### Scenario: Guesses arrive from many machines

- GIVEN an account and its holder, who has signed in from their own machine
- WHEN machines the account has never signed in from guess at it, each fewer times than the install permits and together as many
- THEN every address the account has never signed in from is locked out, including one that did not guess
- AND the holder signs in from their own machine

#### Scenario: The holder's own machine guesses

- GIVEN an analyst who has signed in from their own machine
- WHEN that machine guesses at their account until it is locked out
- THEN the right password from an address the account has never signed in from signs in

#### Scenario: The same wrong password is offered again

- GIVEN an account
- WHEN one wrong password is offered again and again
- THEN it counts as one failure

#### Scenario: A lock follows a lock

- GIVEN addresses locked out of an account, whose lock has lifted, with no right password since
- WHEN they reach the install's number of failures again
- THEN the lock lasts longer than the one before
- AND no lock lasts longer than the install's maximum
- AND fewer failures than the install's number do not lock them again

#### Scenario: An administrator releases an account

- GIVEN an account locked out from the addresses it has signed in from and from every other, one of them more than once
- WHEN an administrator releases it
- THEN its holder signs in
- AND the next lock of an address it has never signed in from lasts the install's first duration

#### Scenario: An account must change its password

- GIVEN an account marked as needing a new password
- WHEN its holder requests anything other than changing it
- THEN they are refused

#### Scenario: The install raises its password minimum

- GIVEN an install that has raised the minimum length a password may be
- WHEN a password shorter than it is set, at any door that sets one
- THEN it is refused
- AND a password meeting the minimum is accepted

#### Scenario: An account holds a password shorter than a raised minimum

- GIVEN an account whose password was set before the minimum was raised
- WHEN its holder signs in with it
- THEN they are signed in

#### Scenario: A password is guessed at through a door other than sign-in

- GIVEN a signed-in analyst's session in somebody else's hands
- WHEN they guess at the current password where it is changed
- THEN each wrong answer counts toward the lock, together with any at sign-in
- AND each is logged as a failed sign-in naming the door

#### Scenario: A locked account's password is offered where it is changed

- GIVEN an account the address of a request is locked out of, and its right password
- WHEN it is offered from that address as the current password to change it
- THEN it is answered exactly as a wrong one
- AND the password is not changed
