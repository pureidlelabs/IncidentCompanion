# A report has an address

## Why

A report is the longest-lived thing an analyst reads in a case, and it is the only part of the case that cannot be pointed at. The report section addresses itself; which report is open inside it is held in the screen and written nowhere, so a link opens the index, a bookmark opens the index, and a reload loses the document somebody was part way through.

That is the half a reader notices. The half that decides the shape is the other one: an address nothing writes is also an address nothing can move. Every route into a report has to be a control the analyst presses, so a report cannot be reached from a search result, from a cross-reference, or from a message an analyst sends a colleague.

`openspec/specs/report/spec.md` states what a report holds, what freezes it and what it owes its audience, and says nothing about reaching one. The behaviour above is observable and unstated, which is what this change settles.

## What Changes

- The open report is named in the address, so it can be linked to, bookmarked and reloaded.
- The address is the answer rather than a copy of it: moving the address moves the screen, in both directions and every time rather than only the first.
- Moving between reports replaces the address rather than stacking an entry, so leaving the section does not mean walking back through every report opened on the way.
- A write that names the open report leaves the rest of the address alone.

## Impact

- `openspec/specs/report/spec.md` -- one requirement added.
- The report section and the container that binds it to the case.
- The prodding sweep, whose check for whether a control navigated away read the whole address, where a search parameter is not a navigation and a fragment is.
