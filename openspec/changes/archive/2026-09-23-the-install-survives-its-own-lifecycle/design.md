# Scope

**Preparation brings the store forward in one act or not at all.** A shape that would discard or convert stored data is refused. There is no path across such a change yet: a release that needs one is a question for generated migrations, which come later (#1086).

**The application keeps no log the install holds.** What is wrong is said by the health answer and by the orchestrator's own status, which is why both have to be right.

**Demonstration content belongs to an install nobody has claimed.** It is written once, before the first account exists, and never again: after a claim, a demonstration case is the analysts' to change or delete.

**A copy is the database without anybody's session, the evidence beside it, and the shape of the store it was taken under.** Returning to it replaces the install's state; it does not merge.

# Design

## The shape of the store is one transaction

Preparation takes a lock, drops every rule that scopes what the application reads, plans the difference between the declared shape and the store over the same connection, and applies it, all in one transaction. A reader arriving meanwhile waits on the lock and then sees the rules as committed; it never sees a table without them.

A planned statement that drops a table, a column, a type, a sequence or a schema, renames, converts a column's type, truncates or deletes is refused: the transaction rolls back, the refused statements are printed, and the step exits with its own code. The classification is made here rather than taken from the planning tool, whose own warnings are empty for exactly these statements.

When the only planned statements are the rules it dropped, and the rules, the store's own functions and triggers, and every table's grants and row security read back as they were, the transaction rolls back rather than committing an identical copy. So preparation run again on an unchanged install writes nothing.

Statements the declared shape cannot express, such as guards on rows that must not change, are applied after the tables in the same transaction.

There is no prompt anywhere in the step, so an attached terminal cannot change what it does. Every caller runs the one step: the orchestrator's preparation, the development loop and the test suites.

## No part of the install runs a package manager

A package manager checks its registry for its own update on a schedule, so a step run through one makes an outbound request from an install nobody pointed anywhere. Every part runs its program directly, and a base image's start-up step that consults a package repository is removed from the image rather than tolerated.

## Built-ins and demonstration content are written only when absent or changed

A built-in is written where what is stored differs from what ships, so an upgrade's content still arrives and a second start writes nothing. Demonstration content is written when the install has no account and no demonstration case, and otherwise not at all.

## An install recovers without anybody acting

The orchestrator starts again any long-lived component that stops without being asked to: the stores, the application and the edge. Preparation steps are not restarted, because each runs once per start.

The application outlives its stores' restarts. A connection a store ends while idle is discarded and replaced on the next use, rather than ending the process. The edge finds the application by name for as long as it runs, so an application that comes back at another address, or is not up when the edge starts, is reached once it is.

## Health stands outside every control that depends on what it reports

The health answer is not subject to any limit counted in the ephemeral store, because with that store gone such a limit fails before the answer can name it. The edge still limits the route.

## The store runs as its own user

The store starts as the user its image owns the data directory by, holding no capability. Preparing that directory as a privileged user and then dropping works on a first start and fails on the second, once the directory is private to the store's user.

## A copy, checked and returned to

A copy is taken from the running install: the database as one consistent dump without session or verification rows, then the shape of the store, then an archive of the evidence directory. Evidence is never rewritten, so an archive taken after the dump holds every artefact the dump names.

Checking a copy restores its database into a scratch database, which a truncated dump cannot survive, refuses a copy carrying session rows or lacking their tables, and requires every artefact the restored rows name to be in the evidence archive.

Returning to a copy checks it first, and refuses a copy taken under another shape of the store before changing anything. It then stops the application and the edge, replaces the database in one transaction as the identity that owns the schema, empties the ephemeral store so nobody stays signed in, replaces the evidence directory, and starts the install again, which runs preparation over the restored store.
