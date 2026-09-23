# Every password check counts

## Why

The lock was decided and the failures counted only on the sign-in path, matched by the path's name. Every other door that checks a password was outside it: the application's own password change checked the current password with no count, and while an account was locked it accepted the right one and replaced the password. The authentication library's own password check answered guesses the same way.

The lock at sign-in worked by overwriting the caller's password in the request body with one that could not match (#1084), so the refusal held only as long as the library read the body exactly once.

## What Changes

- A wrong password counts toward the lock at every door that checks one, into one run.
- While an account is locked its password is wrong at every door, and nothing the right one would do happens.
- Each wrong answer is logged as a failed sign-in naming the door.

## Impact

- `openspec/specs/accounts-and-access/spec.md`: *Authentication resists guessing, and says so to the auditor* states the doors and gains two scenarios.
- The lockout moves to where the password is verified; the body overwrite and the path-matched counting are deleted.
