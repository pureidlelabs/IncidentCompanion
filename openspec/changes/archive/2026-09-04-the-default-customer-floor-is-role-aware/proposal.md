# The default customer's floor answers to the role

## Why

An install has to be able to delete a case nobody has attributed. Today nothing can: deleting a case needs `delete` over its customer, the default customer's floor stops at write, and an administrator holds no case reach by being one. The route that exists is for an administrator to make a group, put the default customer in it and join at `delete` — a self-grant, which the specification permits and logs, but which means the first delete on a fresh install requires building the access model to get at a case nobody owns.

The obvious fix is worse than the problem. Granting an administrator `delete` inside the guard adds a second place where reach is decided: `ReachService` would keep answering `write` for the same account and customer, while the guard answered `delete`. The specification requires reach to be decided once, ahead of anything that serves the case, and two answers is the failure that requirement names. It would also be a second exception to the article that says access is never inherited from a role — and the constitution says a second exception is an amendment rather than an interpretation.

The floor is already the system's own grant, and it is already stated as the one exception. What it is not is aware of who is asking.

## What Changes

- The default customer's floor becomes role-dependent: an analyst reaches it at read and write as now, and an administrator reaches it at delete.
- It stays one grant, held in one place, so every reader of reach — the case guard, the socket, and the access review the specification asks for — gets the same answer without knowing about roles.
- **No new exception.** The floor is not extended to any other customer, and holding the administrator role still grants nothing over a customer somebody has been onboarded as.

## Capabilities

### Modified Capabilities

- `accounts-and-access`: the standing exception for the default customer gains the level an administrator holds over it.

## What this does not settle

**Every case in an install resolves to the default customer**, because nothing writes `cases.customerId` when a case is created — the specification says a case is created against the default and the code creates it against nothing. So an administrator reaching `delete` over the default reaches it over every case that has never been attributed, which today is all of them. That disagreement is its own decision and is recorded separately; this change states the floor, and what the floor covers follows from it.
