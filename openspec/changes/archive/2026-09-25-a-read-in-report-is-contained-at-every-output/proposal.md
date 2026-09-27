# A read-in report is contained at every output

## Why

A sent report read in from an archive was rewritten on the way in, so the preserved document stopped being what was produced: the analyst's written prose lost its addresses and a saved query stopped running (#1245, #1264). The requirement said a preserved document read in is held to the rule without saying where, and an archive can mark any part as the analyst's own writing or as a verbatim query, so the exemptions a report sent from this install carries cannot be trusted on one read in.

## What Changes

- **report**: a preserved document read in is stored as it arrived and held to the rule at every output, its written prose and verbatim queries included. A report sent from this install keeps the analyst's written prose as written.

## Impact

- The import stores a sent report's preserved document unchanged and the install records that the report was read in. Every export of such a report rewrites every address in it.
