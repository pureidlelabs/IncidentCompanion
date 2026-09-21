# Scope

What an import recognises is an entry an import wrote into this case. An entry an analyst typed is never matched against, however alike it looks.

The case holds no identifier the platform gave the alert, so the recognition is over what the entry carries: the product that emitted it, what it says happened, and when. An entry whose description or time an analyst has since corrected is not recognised by a later import, and that import writes its own copy beside it. Carrying the platform's identifier on the row is what would close that, and it is a column and a migration rather than a reading.

Recognition is within one case. The same alert imported into two cases is two entries, because a case is the unit an analyst reasons about.

Nothing here reaches the store's own rule. Two identical entries supplied through any door are two rows, and the identity module still answers that the timeline has no identity.

# Design

**The timeline half is judged where the entity half is, in the preview.** Both are answered by a read of the case at the moment of the import rather than by anything the browser holds, so an entry another analyst's import wrote a minute ago is recognised here rather than duplicated a minute later. A check placed at the write instead would show the analyst a review that does not describe the act it is previewing.

**The naming is built by one function from either side.** A stored row and a mapped candidate are the two things compared, and they carry the same values in different types — a time is a timestamp from the store and text from the mapping. Two builders is how the two sides come to disagree about a row neither can match, which is the defect the entity half already records.

**An entry with no time or no description has no naming, and matches nothing.** An alert the platform sent without a time is placed at the moment of capture, so a second import of it would be a different entry whatever the rule said; answering *no naming* is what keeps that visible rather than matching the wrong row.

**Skipping is decided at the write, not by what was ticked.** The review offers a recognised entry unticked, and an analyst may tick it anyway. The count follows the same decision, so the rows reported as added are the rows written.
