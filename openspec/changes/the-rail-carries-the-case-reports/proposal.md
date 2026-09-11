# The rail carries the case's reports

## Why

A report is reachable by address, and the rail is where a case is navigated from. The two were never joined: the list of a case's reports was drawn by the report section itself and put into a row the rail left empty for it, so it existed exactly as long as that screen was on screen.

An analyst standing on the timeline, or on evidence, or anywhere else in the case therefore cannot see what reports the case holds. The door that starts one is reachable only from the screen that already offers it, which is the one place an analyst does not need another route to it. Every other row of the rail answers from every section; this one answers from one.

The list is not expensive to know. The read the rail already makes to draw itself carries the case's reports, and the section reaches the same rows through a second read of the whole case document.

`openspec/specs/report/spec.md` says a report is named in the address and says nothing about where a case's reports are listed or from where. The behaviour is observable and unstated, which is what this change settles.

## What Changes

- The rail lists the case's reports, and the door that starts one, from every section of the case rather than only from the report section.
- Each row is a destination: it carries the address of the report it names, so it can be opened in a second window and followed from anywhere.
- The row marked is the one that resolved, so a link naming a report the case no longer holds marks the index rather than nothing.
- The count on the Report row is the number of reports, and it does not change with the section the analyst is standing on.

## Impact

- `openspec/specs/report/spec.md` -- one requirement added.
- The case frame, which now draws these rows, and the report section, which no longer does.
- The mechanism by which a screen could take a rail row and draw it itself, which had one user and is removed with it.
