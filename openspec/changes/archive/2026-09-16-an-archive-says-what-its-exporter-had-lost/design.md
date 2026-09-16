# Scope

The count is of what the archive states, not of what the import could verify. An archive somebody edited states whatever they wrote into it.

It says how many, never which.

Where the export decides an artefact is unfound is unchanged.

# Design

**The archive's own statement is relayed, never recomputed.** An evidence row arriving without its bytes looks identical whichever cause produced it, so a count derived from the digests that did arrive can only answer *how many files are absent*. The manifest is the one place the difference is written down, and it is written by the install that knew.

**Part of the absent count, rather than a number beside it.** An artefact the exporting install lost is still an attachment the rows name and the archive did not carry, so subtracting it would make the first count answer a narrower question than its sentence claims.

**The reader hands out what it proved.** The manifest is validated on the way in — its version, its file list, its statement of what travelled and of what was not found — so a caller parsing those same bytes a second time reads a value nothing has checked, and is safe only while the first parse happens to have run.
