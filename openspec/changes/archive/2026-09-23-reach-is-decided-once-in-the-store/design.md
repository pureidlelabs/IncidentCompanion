# Scope

**Reach is decided once, and the store is where.** The level an account holds over a customer, and over a case through its customer, is one rule the store holds. The route guard, the case socket, every list of cases and every row-level policy ask it; nothing in the application settles a level of its own. An explanation of a level for an administrator names the grant behind it and answers the store's level.

**There is no system principal.** Everything the serving application reads or writes of a case is done for somebody. The few acts that have to see past every caller's reach -- counting the cases behind a customer, the reference check and the move of a customer merge, how many cases stand in each state, and which stored artefacts a case names -- are acts the store performs and answers narrowly: counts, identifiers and digests, never a case's contents. The merge's acts refuse anybody who is not an administrator.

**The seeding role is the one exemption.** It writes cases nobody is asking for, on an install that may hold no account yet, so it is exempted per table by its own policy, and the seed one-shot acts as it throughout. Nothing that serves a request connects as it for case data.

**Moving a case out of the mover's reach stays the mover's right**, and is performed by the store after it has asked that the mover writes the case where it is now. A case carrying a reference moves only to a customer the mover reaches.

**One process per install** is the boundary the principal lives within: it is held for the duration of a request or a socket frame in the process serving it.

# Design

## One decision

The store answers two questions: the level an account holds over a customer, and whether a case exists, whose it is and the level an account holds over it. A null customer on a case is the default customer. An account the install does not hold reaches nothing, the default customer included, because the default's floor is an account's by role and there is no role without an account.

The case question does the same work whether or not the case exists: it resolves the customer and the level either way and says separately whether the case is there. So the guard and the socket each ask one question, and an absent case and one out of reach cost the same.

The functions answering these read the rows they decide about as the table's owner, with a fixed search path and every table named by schema, and only the application and seeding roles may call them. They are created by every schema application before the policies that call them.

## Who is asking

A request names its principal once, when it arrives, and it is the account its session belongs to; a socket names it per frame, as the account the connection admitted. Every scope opened for case data carries the principal alongside the case. A scope opened with nobody named is refused before it reaches the store, and the store answers such a scope with nothing in any case.

Work that outlives the frame that asked for it carries that frame's principal: a live document writes itself as the analyst whose edit it last took.

## The policies

Every table holding a case's rows answers a row only to a scope naming its case and a principal who reaches that case: read to see it, write to add, change or remove it. A case itself is answered by its own customer, and destroying one needs delete. A visit to a case is its analyst's alone, and only while they reach the case; removing one asks only whose it is, so a list pruned after reach was withdrawn can still drop what it no longer shows. A record the first reader raises from defaults may be raised at read.

A write the store refuses for reach is answered as the case not being there.

## A refusal after the answer

The guard records a refused reach once the response has gone, naming the case and its customer. The record is the install's concern, and the caller's answer takes the same time whether a line is owed or not.

## The move and the merge

A move is refused to a caller who does not write the case where it is. A case carrying a reference moves only to a customer the mover reaches, and is refused with one fixed answer elsewhere; a mover who reaches the destination is told which case holds the reference, as a create is. Whether the named customer exists is answered either way, because a customer's identifier is unguessable and moving to a customer the mover does not reach is the ordinary use.

A merge names colliding cases by their identifiers and the reference they share.
