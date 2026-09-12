# Data exchange

## ADDED Requirements

### Requirement: A row says which door it came through, and the install decides that

A row written by importing a file MUST say that it came through a file, on every collection that records where a row came from. An analyst reading a collection MUST be able to tell a row somebody typed from a row that arrived in a file.

What the file says about a row's own origin MUST NOT be read. A file naming itself as some platform is a claim by whoever wrote the file, not evidence of where the row came from, so the answer is the install's and never the data's.

A collection with no field for that answer MUST record nothing, rather than a field it does not have.

#### Scenario: A row read out of a file

- GIVEN a collection that records where a row came from
- WHEN a file is imported into a case
- THEN each row written says it came through a file
- AND no row claims an analyst typed it

#### Scenario: A file claims an origin of its own

- GIVEN a file carrying a column that names where its rows came from
- WHEN it is imported
- THEN what that column says is not written
- AND the rows say they came through a file

#### Scenario: A collection that records no origin

- GIVEN a collection with no field for where a row came from
- WHEN a file is imported into a case
- THEN the rows are written
- AND nothing records a field that collection does not have
