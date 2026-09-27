# A guess locks out only the guesser

## Why

A failed password counted against the whole account, so on a network any machine could hold any analyst out: three machines each inside their own rate budget locked the owner of an account, and one alone could do it and then keep it locked with one guess per lock period, because a lock that lapsed came back on the next single failure. The install is deployed on a trusted LAN, where every analyst's machine is such a caller.

## What Changes

- Failures count against the account in two runs: one for the addresses its right password has come from, one for every other. A run that reaches the install's threshold locks only the addresses it counts for, so guessing from elsewhere never locks the holder out of their own machine.
- The first lock lasts the install's duration; each later lock of the same run, with no right password between, lasts longer, up to a maximum the install sets. A lapsed lock takes a full threshold to come back.
- The same wrong password offered again counts once. What is kept to recognise it is useless without the install's secret.
- An administrator's release clears both runs.

## Impact

- `openspec/specs/accounts-and-access/spec.md`: *Authentication resists guessing, and says so to the auditor* states the two runs, the growing lock, the repeated password and the release, with scenarios for each.
- `openspec/specs/accounts-and-access/design.md`: how the runs are chosen and kept, with the sources the control follows.
- `openspec/matrix/asvs.md`: the requirement answers V6.1.1's call to document how the controls prevent malicious account lockout.
- A new install setting for the longest lock.
