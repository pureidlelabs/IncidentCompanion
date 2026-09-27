# Scope

Evidence is deduplicated within a case and never across one. The same bytes attached in two cases are two stored artefacts.

The database is the authority on what an install holds. An evidence directory is kept with the database it was written beside; bytes that database does not name are removed at start, whichever copy is newer.

A deleted or replaced evidence row's bytes are removed at the next start rather than at the moment of deletion.

# Design

**A case is the key, and the digest is only a name within it.** Every way into the store takes the case the bytes belong to, and the case decides where they live, so no path names bytes by digest alone. A consumer added later cannot reach another case's artefact by asking the store, because there is no question the store answers without a case, and only the store opens the evidence directory.

**A case id is checked before a path is built from it**, as a digest is. A value that is not a case id is refused rather than joined.

**Deduplication inside a case is what content addressing is for there**: two rows naming one attachment hold one file. Across cases it would make one case's upload, deletion and filename observable from another.

**An output asks only about what the case says it holds.** An evidence row carrying a digest and no record of the bytes being stored is evidence held elsewhere, and the export neither reads it nor counts it as lost. What an export says it could not find is then what this case recorded and does not have.

**A sent report keeps its figures.** The figures a sent report froze are named by that report for as long as it exists, so they travel in an archive and survive the removal of the rows that first placed them.

**An import creates its case before its artefacts land**, so the artefacts are stored under the case they belong to and a refused import removes that case's artefacts whole. Nothing else can name a case that was never created.

**Deletion removes a case's artefacts after the case is gone.** A failure there does not undo the deletion; the start removes what is left.

**At start, before the install serves, what nothing names is removed.** Each case is asked what its evidence records say it holds and what its sent reports froze, one case at a time and naming the case in every question; every other file in that case goes, and so does every case the database no longer holds, which covers a case removed by a path that never asks the store and a stop between a deletion and its removal. A file written within the last hour is left, because an upload's bytes land before the row naming them commits and an import's before its whole case does.
