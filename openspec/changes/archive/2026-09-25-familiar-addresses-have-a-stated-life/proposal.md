# Familiar addresses have a stated life

## Why

The lockout keeps every address an account's right password has come from, and nothing removed one short of deleting the account. A holder whose machine rotates temporary IPv6 addresses added one per rotation for as long as the account signed in, which is durable state growing without bound and with no stated life, against *What is kept forever is decided, not defaulted*. → #1230

## What Changes

- An address stays familiar for 90 days after the last right password from it, and an account keeps its 20 most recent. Past either, a sign-in from it counts in the unfamiliar run.
- Each right password from an address starts its 90 days again.
- Addresses no longer familiar are removed daily and at boot, and each pass that removes any is logged by count, never by address.

## Impact

- `openspec/specs/accounts-and-access/spec.md`: *Authentication resists guessing, and says so to the auditor* states the life, with scenarios for an address aging out, one kept by use, one crowded out, and the logged removal.
- `openspec/specs/accounts-and-access/design.md`: the two values, where the bound is read and where the removal runs.
- A new install activity event for the removal.
