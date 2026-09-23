# Scope

**The library's surface is an allowlist, and a new release adds nothing to it.** What the install serves of the authentication library is named, operation by operation; anything the library defines beyond that, today or in a later version, is refused without a line being written for it.

**Only the network is refused.** The application's own in-process calls to the library are how an administrator's roster acts and how the first account is claimed, and they are not requests anybody outside can make.

# Design

## One decision at the library's entry point

Every HTTP request to the library is compared by its method and its exact path below the mount, before any other work the library does for it. A request that matches no offered operation is answered with the response the library's router gives a path it never defined. Matching the exact path rather than a normalised one means every spelling the router itself would not route is refused as well, and a spelling it would route differently is refused rather than guessed at.

## The hold, for the library's routes

The application's own routes are held by an interceptor. The library's routes never reach it, so the hold is stated a second time where the library runs its own hooks: a held session is refused every operation except reading its session, signing in, signing out and the in-process password change the application's own change route makes. The refusal carries the same body the interceptor sends, so a client routes on one answer.

## What is recorded

Ending one's own session is recorded after the library has ended it, as a sign-out is, naming the caller as both the actor and the account.
