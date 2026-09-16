# Scope

The count is of what the archive states, not of what the import could verify. Its shape is checked and its content is not cross-checked against the file list or the rows, so an archive somebody edited states whatever they wrote into it.

It says how many, never which.

Where the export decides an artefact is unfound is unchanged.

# Design

**The archive's own statement is relayed, never recomputed.** An evidence row arriving without its bytes looks identical whichever cause produced it, so a count derived from the digests that did arrive can only answer *how many files are absent*. The manifest is the one place the difference is written down, and it is written by the install that knew.

**Not subtracted from the absent count, and not in the same unit as it.** An artefact the exporting install lost is still an attachment the rows name and the archive did not carry, so taking it out would make that count answer a narrower question than its sentence claims. The two are counted differently, though: the archive states one entry per artefact and the absent count is of rows, so one lost file that two rows name reads as two absent and one lost. What the operator is told names each unit rather than reconciling them, because the archive carries no way to map its statement back to the rows.

**The reader hands out what it proved.** The manifest is validated on the way in — its version, its file list, its statement of what travelled and of what was not found — so a caller parsing those same bytes a second time reads a value nothing has checked, and is safe only while the first parse happens to have run.
