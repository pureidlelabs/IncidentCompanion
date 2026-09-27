# The authentication library serves only what the install offers

## Why

The authentication library is mounted ahead of the application's own routing, so none of the application's guards, its password hold or its route-set tests reach what it serves. It defines 47 method and path pairs and answered 30 of them over HTTP, where the product offers six: signing in, reading one's own session, signing out, and listing and ending one's own sessions. The rest included checking a password outside the lockout, changing a password without releasing the hold, renaming oneself to another account's display name with nothing recorded, and an administrator reading any account through a route the application never meant to offer.

A list of closed routes was kept by hand beside the library's own table, and nothing held the two together. A route the list did not name was open, and a disabled route answered differently from a route that never existed.

An account that must change its password was held only on the application's own routes; the exemption meant to let it reach the library's was never reached, and the library served it everything.

## What Changes

- An account operation is reachable only where a requirement offers it, and every other operation answers as a route that never existed, whatever its spelling.
- A held account reaches only reading its own session, signing in and signing out among those operations.
- An account does not change its own display name.
- An analyst ending their own sessions is logged as an administrative event.

## Impact

- `openspec/specs/accounts-and-access/spec.md`: one requirement added; *Administrative events are logged* gains a scenario.
- `openspec/specs/the-api/spec.md`: *The interface describes itself* gains a scenario for routes a mounted library serves.
- The authentication options, the password hold, the published document and the tests that drove routes no longer served.
