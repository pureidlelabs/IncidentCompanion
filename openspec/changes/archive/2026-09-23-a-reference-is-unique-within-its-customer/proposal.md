# A reference is unique within its customer, including on import

## Why

*Where a case carries a reference it MUST be unique within its customer* is already required, and nothing enforced it on the path that introduces collisions. Cases could be created freely with one reference, while the customer merge refused on exactly that collision -- so a merge could be blocked by a state the product had allowed somebody to reach, and the only way out was to change a reference the analyst may not own.

Enforcing it surfaced a conflict the specifications do not resolve. Reading a `.iccase` archive of a case the install still holds creates a second case carrying one reference, which this rule forbids. The archive capability requires that a re-import arrive as a new case rather than over the old one, and says nothing about the reference at all -- its design record speaks only of remapping the identifiers that say what a row is called here.

So two specified behaviours met with no stated answer between them, and the silence had to be resolved rather than worked around: an exemption for imported cases puts the rule back where it started, unenforceable exactly where collisions come from.

## What Changes

- The case-archive capability states that reading an archive is refused where the reference it carries is already held within that customer, and that the refusal names the case holding it.
- No change to what `cases` requires. That requirement was already correct; what was missing was enforcement and a stated answer for the import path.

## Impact

An operator re-importing a case they still hold now meets a refusal rather than a second case. Their way out is to free the reference on one of the two, which the refusal names so they can. An archive read into an install that does not hold the reference -- the cross-install handover the format exists for -- is unaffected.
