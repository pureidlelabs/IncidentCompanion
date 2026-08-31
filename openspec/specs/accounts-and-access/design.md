# Scope

**Nobody creates their own account.** The single exception is the first one, and it is offered only while the install holds no accounts at all rather than while it holds no administrator.

**The application is not the authority for a federated account's credentials**, and does not duplicate what the provider guards. Password rules, lockout and the second factor are the local account's business only.

**Nothing here sends a message.** There is no channel out, so no credential is reset by email and no approval is requested from anyone. That is what makes a recovery credential necessary rather than a convenience.

**A second factor is not required by default**, and whether to require it is the install's policy rather than the product's position. The product owes the mechanism and an honest statement of what leaving it off costs.

**An administrator can grant themselves data access, and nothing prevents it.** The power to manage groups is the power to join one. The product's answer is the record rather than a restriction, because whether that is acceptable is the operator's question — their screening, their separation of duty.

**Delete is the case as a whole and nothing smaller.** Removing an entry, an entity or a section is ordinary work at the write level.

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

A local account locks after a number of consecutive failures the install sets, for a duration the install sets, and an administrator can release it.

A second factor can be enrolled on any account whether or not the install requires one. Whether it is required is a single install-level policy evaluated at sign-in, and an install that has not turned it on is told plainly what that falls short of.

## Federation moves authentication, not reach

An install can hand authentication to the organisation's identity provider over OpenID Connect. The provider is then the authority for who the person is; this application remains the authority for what they reach.

A federated account holds no local credential, so nothing here can lock it, reset it or enrol a factor for it. The provider's groups map to this install's groups, and the mapping is a management-plane act like any other.

At least one local administrator remains, so an install whose provider is unreachable is not an install nobody can enter.

## A session ends twice over

A session ends after an idle period the install sets, and independently at an absolute lifetime the install sets. Both are evaluated and whichever falls first ends it: a session that stays busy unattended is still one nobody is watching.

## What an administrator can answer, and what is recorded

For every account the install knows: whether it is local or the provider's, whether it holds the management grant, when it last signed in, whether it carries a second factor, and every customer it reaches with the level and the membership that grants it.

Every sign-in is recorded with its outcome and how it was attempted. Every refusal of a customer or a case is recorded with who was refused and what they asked for. Every change to who reaches what is recorded with the actor, the subject and the time — including an administrator granting themselves, where the actor and the subject are the same account.

The record cannot be suppressed by whoever it would record, and where an event cannot be recorded the act it describes does not happen.
