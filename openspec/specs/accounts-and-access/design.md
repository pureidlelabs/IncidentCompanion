# Scope

**Nobody creates their own account.** The single exception is the first one, and it is offered only while the install holds no accounts at all rather than while it holds no administrator.

**The application is not the authority for a federated account's credentials**, and does not duplicate what the provider guards. Password rules, lockout and the second factor are the local account's business only.

**Familiarity is by address, and an address is what the install can know about a machine.** Where the network hands an address to another machine, the familiarity goes with it; analysts behind one address are one source. An account that has never signed in has no familiar address, so guessing can hold its holder's first sign-in until the lock lifts or an administrator releases it, and a holder on a new machine meets whatever the unfamiliar run holds.

**An administrator releases a lock by resetting the password.** The reset clears both runs; the addresses the account knows survive it.

**Nothing here sends a message.** There is no channel out, so no credential is reset by email and no approval is requested from anyone. That is what makes a recovery credential necessary rather than a convenience.

**A second factor is not required by default**, and whether to require it is the install's policy rather than the product's position. The product owes the mechanism and an honest statement of what leaving it off costs.

**An administrator can grant themselves data access, and nothing prevents it.** The power to manage groups is the power to join one. The product's answer is the record rather than a restriction, because whether that is acceptable is the operator's question — their screening, their separation of duty.

**Delete is the case as a whole and nothing smaller.** Removing an entry, an entity or a section is ordinary work at the write level.

**The authentication library serves only what a requirement here offers.** Its surface is an allowlist named operation by operation: whatever else it defines, in this version or a later one, is refused as a route that never existed, and the application's own in-process calls to it are not requests anybody outside can make.

# Design

## Two grants that do not imply each other

An account carries a management grant and, separately, a set of data memberships. Neither is derived from the other, and holding both is a state an administrator reaches deliberately.

The management grant covers the install: accounts, groups and memberships, which customers exist, federation, retention and the install's settings. The data memberships cover what a case holds.

## Reach is resolved from memberships, per request

A group holds customers. A membership is an account in a group at a level, and the levels are ordered: read, then read and write, then read, write and delete.

An account's reach over a customer is the highest level among its memberships in groups holding that customer. Both an account and a customer may sit in several groups, so overlap is normal and resolves to the most permissive.

An account with no membership reaches no customer's cases beyond the default customer, which every account reaches.

Reach is resolved from the caller's own session on the request that needs it. It is never carried from one caller to another and never answered from whoever has the case open.

## The install cannot lose its administration

The last account holding the management grant can be neither removed nor demoted. The check is made against the state the operation would produce rather than against the operation, so removal and demotion are one rule and not two.

A recovery credential is issued when the install is claimed. It restores administration and does nothing else — it is not a password reset and grants no data reach — and it is the only way back that does not need somebody who is already an administrator.

## Local sign-in resists guessing

The control follows Microsoft Entra smart lockout, where familiar and unfamiliar locations have separate lockout counters so that attackers are locked out while the genuine user keeps signing in, and the OWASP Authentication Cheat Sheet, which associates the failure counter with the account rather than with the source address. → <https://learn.microsoft.com/en-us/entra/identity/authentication/howto-password-smart-lockout>, <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>

A failure counts in one of the account's two runs. The address that chooses the run is the caller's as the authentication library resolves it for its own rate limit and for the session it writes, so the lock, the limit and the session record answer who called from one resolution. An address the account's right password has been given from is familiar and its failures count in the familiar run; every other failure, including one with no address at all, counts in the unfamiliar run. A run locks at the install's threshold and locks only the addresses it counts for. A right password on an open run forgets that run and makes the address familiar; a right password while its run is locked is answered as a wrong one and counts nothing.

The first lock of a run lasts the install's duration, and each later one twice the one before, up to the install's maximum: the exponential lockout the cheat sheet describes, stepped per lock rather than per attempt. A lock resets its run's count, so a lock that has lifted takes the install's threshold to fall again, and one failure per lapse holds nobody out. The consecutive count is forgotten by a right password in that run or by a release. While a run is locked nothing is counted in it and its lock is not extended.

A run remembers its last three wrong passwords, as Entra tracks the last three bad password hashes, and a password it remembers does not count again. What it keeps is a message authentication code under the install's secret over the account and the password: holding the store without the secret confirms no guess, and one guess at two accounts is kept as two unrelated values. Holding both the store and the secret tests a remembered guess at the speed of that code, not of the password hash, so the secret is the boundary.

The lock lives where a password is verified rather than at any door, so every door that checks one counts into the same runs and refuses a locked run's right password as a wrong one, including a door added later. Every refusal there runs the same statements whether its run is open or locked, so a locked run costs what a wrong password does, and the record of a failure at an address with no account spends them too. The failure that reaches the threshold marks the run's lock as pending in the statement that counts it, and the lock is taken, in the same transaction, together with its audit line. A pending run is shut as a locked one is, so no run that has reached the threshold admits its right password, and failures arriving together are each counted and lock the run once. A right password forgets only a run that is open and has no pending lock when it is answered, so one arriving behind the failure that locked its run is answered as a wrong one. No lock stands without its audit line: where the log cannot take the line, the lock stays pending and the run stays shut, every later answer in that run tries the lock and its line again, and the lock falls, at the length its place in the run's sequence gives it, as soon as the log takes the line. A release clears a pending lock with the rest of the run. Pending is its own state, never read from the count, so a threshold lowered below a run's count does not shut that run. The threshold is read as each failure arrives, so a change landing while a failure is being counted applies from the next one. A threshold lowered below a run's count takes effect at that run's next failure, and until then the run stays open to its right password. A run is keyed by the caller's whole address, never by the network it sits on: one IPv6 network is one LAN, not one machine. A holder whose machine rotates temporary IPv6 addresses is unfamiliar after each rotation until their next right password, so a guesser can lock them out in that interval.

The runs and the familiar addresses are held in the database beside the accounts. A lock that a restart or a cache flush lifts is a control the ephemeral store can switch off.

The threshold an install may set is bounded above, so no stored setting turns the control off while a screen still shows a number. The bound is NIST SP 800-63B's limit of no more than 100 consecutive failed attempts against one account. The longest lock an install may set is a day.

A second factor can be enrolled on any account whether or not the install requires one. Whether it is required is a single install-level policy evaluated at sign-in, and an install that has not turned it on is told plainly what that falls short of.

## Federation moves authentication, not reach

An install can hand authentication to the organisation's identity provider over OpenID Connect. The provider is then the authority for who the person is; this application remains the authority for what they reach.

A federated account holds no local credential, so nothing here can lock it, reset it or enrol a factor for it. The provider's groups map to this install's groups, and the mapping is a management-plane act like any other.

At least one local administrator remains, so an install whose provider is unreachable is not an install nobody can enter.

## A session ends twice over

A session ends after an idle period the install sets, and independently at an absolute lifetime the install sets. Both are evaluated and whichever falls first ends it: a session that stays busy unattended is still one nobody is watching.

## What an administrator can answer, and what is recorded

For every account the install knows: whether it is local or the provider's, whether it holds the management grant, when it last signed in, whether it carries a second factor, and every customer it reaches with the level and the membership that grants it.

Every sign-in is recorded with its outcome and how it was attempted. Every refusal of a customer or a case is recorded with who was refused and what they asked for; a line names its actor's account only where the install holds it, and keeps the name the session carried either way, so a session that outlived its account is recorded under the name it was issued to. Every change to who reaches what is recorded with the actor, the subject and the time — including an administrator granting themselves, where the actor and the subject are the same account.

The record cannot be suppressed by whoever it would record, and where an event cannot be recorded the act it describes does not happen.

A caller's own ending of a session, signing out included, is recorded where the session is deleted: once per session, and only for a session that existed. The operation answers the same whether it ended anything or not, so its answer is not evidence of an ending.

An administrator's act is decided by the write that performs it, never by the request. Removing a membership or a customer from a group names the thing removed, so where there is none the act is refused as not there, as a grant naming a missing group or account is, and the record holds a refused request rather than the removal. Asking for a state that already stands — a membership at the level it has, a customer the group already holds, an account's current state or role — is answered as done and writes no line for the change: the state asked for is the state there is, and nothing changed to record.
