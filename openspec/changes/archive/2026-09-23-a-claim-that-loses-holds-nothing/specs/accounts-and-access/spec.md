# Accounts and access

## MODIFIED Requirements

### Requirement: An account is provisioned, never self-created

An install MUST NOT let somebody create their own account. An account exists because an administrator made it, and its holder's reach begins at nothing.

The first account is the exception, and MUST be creatable only while the install holds no accounts at all — not merely no administrator.

Claiming an install MUST require a bootstrap credential that only somebody with access to the machine can obtain. It MUST be issued to the install's own output at start, never over the network, and MUST be verifiable without revealing it to a caller who guesses. Reaching the service first MUST NOT be enough to become its administrator.

Whether an install is still claimable MUST be decided from what it holds when the claim is made, never from what was true when it started. Claiming MUST be atomic: two claims arriving together MUST produce one administrator. A claim that loses MUST leave nothing behind — no account and no session, in any store the install keeps one in.

#### Scenario: An install with no accounts is claimed

- GIVEN an install holding no accounts
- AND a bootstrap credential issued to its own output at start
- WHEN somebody presenting that credential claims it
- THEN they become its administrator

#### Scenario: Somebody reaches the service first

- GIVEN an unclaimed install reachable over the network
- WHEN somebody without the bootstrap credential attempts to claim it
- THEN it is refused
- AND the attempt is logged

#### Scenario: Two claims arrive together

- GIVEN an unclaimed install
- WHEN two valid claims arrive at the same moment
- THEN exactly one administrator exists afterwards
- AND the claim that lost holds no account and no session

#### Scenario: The claim is attempted twice

- GIVEN an install that already has an administrator
- WHEN somebody attempts to claim it
- THEN it is refused
- AND the attempt is recorded

#### Scenario: A new account reaches nothing

- GIVEN an administrator creating an account
- WHEN it is created and put in no group
- THEN its holder can sign in
- AND reaches no customer's cases except the default customer
