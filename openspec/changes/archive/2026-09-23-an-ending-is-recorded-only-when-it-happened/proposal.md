# An ending is recorded only when it happened

## Why

Signing out and ending one of one's own sessions answer the same whether or not a session ended: the authentication library ends only a session the caller holds, and says it succeeded either way. The line recording an ending was written from that answer. Any analyst could write the record of an ending that never happened, naming themselves as the account whose session ended while another account's session went on being served, and every sign-out, with a session or without one, was recorded with nobody as the actor.

## What Changes

- An entry in the record says what happened, not what was asked for; a request that changed nothing is not logged as the change it named.
- Each session an analyst ends, signing out included, is logged once with who ended it; a request that ends nothing logs nothing.

## Impact

- `openspec/specs/accounts-and-access/spec.md`: *Administrative events are logged* states that an entry records what happened; *An analyst ends their own session* covers signing out and logs each session ended; one scenario added.
- `openspec/specs/accounts-and-access/design.md`: where an ending is recorded.
- The authentication options record an ending where the session is deleted rather than where it was requested.
