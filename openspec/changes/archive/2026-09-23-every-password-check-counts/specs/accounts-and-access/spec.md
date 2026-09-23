# Accounts and access

## MODIFIED Requirements

### Requirement: Authentication resists guessing, and says so to the auditor

This requirement governs local accounts. An account whose credentials belong to an identity provider is guarded there, and this install MUST NOT duplicate it.

Sign-in MUST resist repeated guessing. A local account MUST lock after a number of failures the install sets, for a duration the install sets, and the lock MUST be releasable by an administrator.

**Every door that checks a password is a door a guess arrives through.** A wrong password MUST count toward the lock whichever door checked it — signing in, confirming the current password before changing it, or any other — and the failures from every door MUST count into one run. While an account is locked, its password MUST be answered as wrong at every door, and nothing a door would do with the right one — signing in, replacing the password — MUST happen. Each wrong answer MUST be logged as a failed sign-in, naming the door.

Local passwords MUST meet a policy the install sets. Where a password must be changed, the holder MUST be unable to reach anything else until they change it.

A policy the install sets MUST govern every door that writes a password, including any the authentication library serves itself, and MUST take effect without a restart. A bound read when the process started is one an administrator cannot raise, and a control that records a change it does not apply is worse than one that was never offered.

The policy MUST govern what may be written and never what may be offered. Raising the minimum MUST NOT refuse a password already in use, or the change locks out every account holding a shorter one.

These controls exist to answer OWASP ASVS 5.0 Level 2, which the constitution names as the grounding.

#### Scenario: Repeated failures lock an account

- GIVEN an account
- WHEN sign-in fails more times than the install permits
- THEN the account is locked
- AND further correct credentials do not sign it in until the lock lifts

#### Scenario: A locked account reveals nothing

- GIVEN a locked account
- WHEN somebody attempts to sign in
- THEN the response does not distinguish a locked account from a wrong password

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

- GIVEN a locked account and its right password
- WHEN it is offered as the current password to change it
- THEN it is answered exactly as a wrong one
- AND the password is not changed
