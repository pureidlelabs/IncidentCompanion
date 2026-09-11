# Report

## ADDED Requirements

### Requirement: A case's reports are navigation, and are reachable from every section

The case's reports MUST be listed wherever the case is navigated from, and MUST be listed there from every section of the case rather than only from the section that draws a report.

A report is the longest-lived thing an analyst reads in a case, so what reports a case holds is part of knowing the case. An analyst reading its timeline can see what has been written about it without first leaving what they are reading.

The door that starts a report MUST be offered in the same place. Starting one is a top-level act, and offering it only from the section that already lists them puts it behind the one route that does not need it.

Each report MUST be offered as a destination carrying its own address, so it can be opened alongside what is already open rather than in place of it.

The report marked as the one being read MUST be the report that resolved, not the one the address asked for. An address naming a report the case no longer holds draws the index, and the index is what is then marked.

How many reports the case holds MUST NOT depend on which section the analyst is standing in.

#### Scenario: An analyst is reading another part of the case

- GIVEN a case holding reports
- WHEN an analyst is on a section other than the one that draws a report
- THEN the case's reports are listed, and the door that starts one is offered

#### Scenario: A report is opened from elsewhere in the case

- GIVEN an analyst on a section other than the one that draws a report
- WHEN they choose one of the case's reports
- THEN that report is drawn, as the address naming it draws it

#### Scenario: A case holds no reports

- GIVEN a case that has produced no report
- WHEN an analyst looks at where the reports are listed
- THEN no report is listed and the door that starts one is still offered

#### Scenario: The address names a report the case no longer holds

- GIVEN an address naming a report that has since been removed
- WHEN it is opened
- THEN the index is drawn, and the index is what is marked as being read

#### Scenario: The analyst leaves the section that draws a report

- GIVEN an analyst reading a report
- WHEN they move to another section of the case
- THEN the case's reports are still listed, and how many the case holds is unchanged
