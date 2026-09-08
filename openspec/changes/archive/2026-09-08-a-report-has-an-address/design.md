# Scope

The address names which report is open and nothing else about it. Which section of a report is being written, where the pane is scrolled and what the outline has folded stay out: they are states of reading rather than of what is being read, and an address carrying them is one nobody can send.

The set of things that write this address is closed to the section itself. Nothing outside the report section composes an address naming a report today, and a producer of such links -- a search result, a cross-reference -- is work of its own.

There is no redirect from an address without a report to one with a guess. An address naming no report opens the index, and an address naming a report the case does not hold opens the index as well.

# Design

**A report is a pane inside the case's report section, not a section of the case.** The case rail carries one row per section, so a report addressed as a section of its own would appear on that rail beside Timeline and Entities -- which is what the section's own rail rows already do better, under one row. So the report travels as a parameter of the section's address rather than as a path of its own.

**The screen follows the address rather than remembering it.** A screen that seeds its own state from the address answers what the address said when the screen was first drawn, and the application draws one screen per section and re-renders it in place: the address then moves and the screen does not. Where a caller takes responsibility for the address, that caller's answer is the screen's answer on every draw. Where no caller does -- a part exercised alone, in a gallery or a test -- the screen keeps its own, so it stays drawable with no address at all.

**A write of the address is composed from the address, never from a framework's copy of it.** A command can travel to a section on the address and be carried out by the screen that owns the control for it, and carrying one out clears it from the address directly, where the routing layer does not see it. A copy held by that layer therefore holds a command that has already run, and a write composed from the copy puts it back -- where the screen finds it and runs it a second time. Reading the address itself costs nothing and cannot go stale.

**Moving between reports replaces rather than adds.** Reading is a walk, and a history entry per report turns leaving the section into a walk back out of it. What precedes the section in the history is where the analyst came from, and that is what Back owes them.

**A search parameter is not a navigation, and a fragment is.** Anything walking the interface and asking whether pressing a control left the section reads the path and the fragment, because a nested section is addressed by fragment; the search string is where a section keeps its own state and moving it means the analyst is where they were.
