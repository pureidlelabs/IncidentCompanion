# An answer says what happened

## Why

A single-row removal naming no row in the case, whether no row has that id or the row is another case's, was refused as somebody having written first (#1256). A client told that goes to re-read and merge a row it cannot see. An administrator's removal of a membership or a held customer that was not there, and a repeated hold, were logged as the change they named (#1257). The requirements already forbid both; neither had a scenario that would show it false.

## What Changes

- **the-api**: a removal naming nothing in the case is refused as not there, identically for a missing row and another case's, and a removal at a version the row no longer holds is refused as somebody having written first, naming the version it holds.
- **accounts-and-access**: a removal that removes nothing, and a request for a state that already stands, log nothing as the change. An act whose change was made but whose answer failed is finished when asked again, and logged once.

## Impact

- Every collection's single-row removal tells the two refusals apart in the one path they share.
- Removing a membership or a held customer that is not there is refused as not there. A repeated grant at the same level, a repeated hold, and an account's current state or role are answered as done with no line for a change.
