# A claim that loses holds nothing

## Why

Claiming an install signed the claimant up, and so signed them in, before the database decided which of two racing claims won. The losing claimant's account was then taken back, which removed its session from the database and left the cached copy the install actually serves sessions from. The loser was refused, and the refusal carried a session cookie that went on being served until the cache expired — as an account that no longer existed, and in most measured rounds as an administrator.

## What Changes

- A claim that loses leaves no account and no session anywhere.
- Only the winner is signed in, once it has won.

## Impact

- `openspec/specs/accounts-and-access/spec.md`: *An account is provisioned, never self-created* says what a losing claim leaves, and *Two claims arrive together* gains the clause.
- The claim signs its winner in after the promotion commits; a sign-up makes no session.
- The server tier gains an install with no accounts, cloned per file, so the claim is exercised over HTTP.
