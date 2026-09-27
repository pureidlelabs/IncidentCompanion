# Scope

**Familiarity is by address, and an address is what the install can know about a machine.** Where the network hands an address to another machine, the familiarity goes with it; analysts behind one address are one source. An account that has never signed in has no familiar address, so guessing can hold its holder's first sign-in until the lock lifts or an administrator releases it, and a holder on a new machine meets whatever the unfamiliar run holds.

**An administrator releases a lock by resetting the password.** The reset clears both runs; the addresses the account knows survive it.

# Design

## Two runs per account

The control follows Microsoft Entra smart lockout, where familiar and unfamiliar locations have separate lockout counters so that attackers are locked out while the genuine user keeps signing in, and the OWASP Authentication Cheat Sheet, which associates the failure counter with the account rather than with the source address. → <https://learn.microsoft.com/en-us/entra/identity/authentication/howto-password-smart-lockout>, <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>

A failure counts in one of the account's two runs. The address that chooses the run is the caller's as the authentication library resolves it for its own rate limit and for the session it writes, so the lock, the limit and the session record answer who called from one resolution. An address the account's right password has been given from is familiar and its failures count in the familiar run; every other failure, including one with no address at all, counts in the unfamiliar run. A run locks at the install's threshold and locks only the addresses it counts for.

A right password on an open run forgets that run and makes the address familiar. A right password while its run is locked is answered as a wrong one and counts nothing.

## How long a lock lasts

The first lock of a run lasts the install's duration, and each later one twice the one before, up to the install's maximum; this is the exponential lockout the cheat sheet describes, stepped per lock rather than per attempt. A lock resets its run's count, so a lock that has lifted takes the install's threshold to fall again, and one failure per lapse holds nobody out. The consecutive count is forgotten by a right password in that run or by a release. While a run is locked nothing is counted in it and its lock is not extended.

## A wrong password offered again

A run remembers its last three wrong passwords, as Entra tracks the last three bad password hashes, and a password it remembers does not count again. What it keeps is a message authentication code under the install's secret over the account and the password: holding the store without the secret confirms no guess, and one guess at two accounts is kept as two unrelated values.

## One check, whatever the door

Every door verifies a password through the one verification the authentication options name. Every refusal there runs the same statements whether its run is open or locked, so a locked run costs what a wrong password does, and the record of a failure at an address with no account spends them too. Failures arriving together are each counted, and the lock is taken only from the count its failure saw, so they lock the run once.

The runs and the familiar addresses are held in the database beside the accounts. A lock that a restart or a cache flush lifts is a control the ephemeral store can switch off.
