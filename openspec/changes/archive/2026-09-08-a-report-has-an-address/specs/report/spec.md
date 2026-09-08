# Report

## ADDED Requirements

### Requirement: The report an analyst is reading is in the address

The address MUST name which report the report section has open, and MUST name none when the section is on its index.

A report is read across days and handed between analysts, so it MUST be reachable by an address alone: a link opens the report it names, and a reload opens the one that was open.

The address MUST be the answer rather than a record of it. Wherever the address moves, the section MUST follow it -- to another report, and back to the index -- and MUST do so every time rather than only when the section is first drawn.

Moving between reports MUST replace the address rather than add to the history. An analyst reading four reports and then leaving the section goes where they were before the section, not back through the four.

A write that names the open report MUST leave the rest of the address alone. The address is shared with everything else the section puts there, and a write that rebuilds it discards what it did not write.

#### Scenario: A link names a report

- GIVEN an address naming a report of the case
- WHEN it is opened
- THEN that report is drawn, and not the index and not another report

#### Scenario: A reload keeps the analyst's place

- GIVEN an analyst reading a report
- WHEN the screen is reloaded
- THEN the same report is drawn

#### Scenario: The address moves to a second report

- GIVEN an analyst reading one report
- WHEN the address is moved to another report of the same case, without the section being drawn afresh
- THEN the second report is drawn and the first is not

#### Scenario: The address moves back to the index

- GIVEN an analyst reading a report
- WHEN the address stops naming one
- THEN the index is drawn

#### Scenario: Opening a report does not stack a history entry

- GIVEN an analyst on the report section
- WHEN a report is opened
- THEN going back leads to whatever preceded the section, not to the index of it

#### Scenario: The address carries something else as well

- GIVEN an address that carries a parameter belonging to another part of the section
- WHEN a report is opened
- THEN that parameter is still there

#### Scenario: A command travelled on the address and has been run

- GIVEN a command that reached this section on the address and has already been carried out
- WHEN the open report is written into the address
- THEN the command is not written back, and does not run a second time
