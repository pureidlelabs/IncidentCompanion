# A raised password minimum is what every door asks

## Why

An install could set `auth.minPasswordLength`, the change was recorded as a downgrade when it was lowered, and nothing read the stored value when a password was set. The function written to enforce it had no caller at all. So an operator who raised the minimum to sixteen got a line on the audit saying they had, and the install went on accepting twelve.

The requirement was already written down — *Local passwords MUST meet a policy the install sets* — so this is the code failing a standing requirement rather than a new one. What was missing is the two properties that make such a bound real, and neither was stated: that it governs **every** door, including the ones the authentication library serves itself, and that it governs what may be **written** rather than what may be offered.

The second is the one worth writing down. Applying the bound to sign-in would refuse every account holding a password set before the raise — the whole install at once, recoverable only by an administrator resetting each account. It is the likeliest wrong way to satisfy the first.

## What Changes

- A policy the install sets governs every door that writes a password, including the library's own, and takes effect without a restart.
- The policy governs what may be written and never what may be offered.

## Impact

- `openspec/specs/accounts-and-access/spec.md` — one requirement gains two paragraphs and two scenarios.
- `server/src/auth/auth.config.ts` — one guard over the paths that carry a new password, reading the stored bound per request.
- `server/src/auth/change-password.controller.ts` — a refusal for length is answered as itself rather than as a wrong current password.
- An analyst whose install has raised the minimum is refused a shorter password at every door, and told the number at the one door they can reach.
