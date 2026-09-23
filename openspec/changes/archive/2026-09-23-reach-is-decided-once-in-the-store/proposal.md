# Reach is decided once, in the store

## Why

Two specifications require the store to refuse what its caller does not reach, and the store knew only which case a statement named. `the-api` says *whether a caller may see a row MUST be enforced by the store that holds it*, and `state` says *the store MUST refuse rows outside the boundary the caller reaches*. Every policy compared a row's case with the case the application had set, so a handler naming the wrong case was served that case: measured on c6ce900, `CollectionService.list` answered another customer's timeline to an analyst in no group that held it, and `cases` and `case_visits` carried no policy at all.

With every case route's guard taken away, which is what a forgotten `@UseGuards` is, six routes served a case out of reach and an analyst holding only the default customer deleted it.

Reach was also decided in three places: the route guard, the case socket's own copy, and a list filter. They agreed by being kept in step, and the guard did different work for a case out of reach than for one that does not exist: one statement against five, and a refusal record written before the answer.

A session that outlived its account reached the default customer at write, because the floor granted it to whatever id arrived.

Moving a case answered by the destination's references: a probe case carrying a guessed ticket was refused where the customer held it and moved into that customer where it did not.

The customer merge refused a collision by quoting both cases' titles to an administrator who need reach neither customer.

## What Changes

- **One reach decision, in the store.** The level an account holds over a customer, and over a case, is decided once there; the route guard, the case socket, the lists and the row-level policies all ask it.
- **The store knows who is asking.** Every scope carries the principal as well as the case, set once per request and per socket frame. Scoped access with nobody named is refused, and the policies on every case table, `cases` and `case_visits` refuse a row the principal does not reach: read to see it, write to change it, delete to destroy a case.
- **An identity the install does not hold reaches nothing**, the default customer included.
- **A refusal does the same work whether or not the case exists**, and the refused reach is recorded once the answer has gone.
- **A case carrying a reference moves only to a customer the mover reaches**, refused with one fixed answer elsewhere; a case without one still moves anywhere. A mover who reaches the destination is told which case holds the reference.
- **A merge names colliding cases by id and the reference they share**, never by what they say.

## Impact

- `state`, `the-api`, `accounts-and-access`, `cases` and `customers` specifications: scenarios added to five requirements, and one requirement's text strengthened to say a scope carries who is asking.
- `state/design.md` and `cases/design.md`: the store's reach decision, the principal, and the narrowed move boundary.
- Every schema application creates the store's reach functions before the policies that call them.
- The seed one-shot acts as the seeding role throughout; it writes cases nobody is asking for.
- A handler that forgets its guard, names the wrong case or runs with nobody named is refused by the store rather than served.
