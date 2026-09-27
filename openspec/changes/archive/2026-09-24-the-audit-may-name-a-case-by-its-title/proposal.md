# The audit may name a case by its title

## Why

The install audit names a case by the title an analyst typed, and it is read by administrators who may not reach that case's customer (#1190). The requirement kept case content out of the audit, and a title typed by an analyst read as content. The maintainer decided on 2026-09-24 that a title is operational metadata the audit may carry: without it an administrator cannot tell which incident an event was about, and resolving it per reader would make the audit's content depend on who reads it.

## What Changes

- **install-audit**: a line may name its case by the case's title, and the audit is a record of acts rather than a list of cases. Everything else written in a case stays out.

## Impact

- The list-reach test holds the audit out by this requirement rather than as undecided.
