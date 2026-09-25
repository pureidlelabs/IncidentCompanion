# A read-in report is contained by the archive too

## Why

The report requirement was amended to say a preserved document read in is stored as it arrived and held to the no-live-indicator rule at every output, its written prose included (#1245, #1264). The case-archive requirement checking an archive's rows still exempted what an analyst wrote in it, as a report sent here is, so the two specifications disagreed about a read-in report's written prose.

## What Changes

- **case-archive**: a preserved document an archive carries is stored as it arrived, and every output of it carries no live indicator whichever part the archive marks as an analyst's writing.

## Impact

- None beyond the report change: the import already stores the document unchanged and every output of a read-in report applies the rule in full.
