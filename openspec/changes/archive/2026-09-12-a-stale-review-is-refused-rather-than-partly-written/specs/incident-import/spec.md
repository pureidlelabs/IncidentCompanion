# Incident import

## MODIFIED Requirements

### Requirement: Nothing is written until an analyst has approved it

An import MUST show the analyst what it proposes to write before writing any of it. Each proposed row MUST be individually approvable, and the analyst MUST be able to correct a value before it is written.

An analyst MUST be able to decline a proposed row, and declining MUST be possible without abandoning the rest of the import.

A correction the analyst makes MUST be checked against the same description that governs a row written by hand. An import MUST NOT be a way to put a value into a case that the analyst could not have typed.

An approval naming rows the import no longer proposes MUST be refused, and the refusal MUST say that the review is out of date. Writing the part that still resolves would write less than the analyst approved and report it as a success, which tells them the import did something it did not do.

A correction addressed to a row the import no longer proposes MUST be refused the same way. Applying the corrections that still resolve and dropping the rest writes a row carrying the value the analyst edited away, which is the same failure with no count to notice it by.

#### Scenario: An import is previewed

- GIVEN an incident selected on a detection platform
- WHEN the analyst asks to import it
- THEN they are shown every row it would write
- AND nothing has been written yet

#### Scenario: An analyst declines part of an import

- GIVEN a preview of an import
- WHEN the analyst declines some of the proposed rows and accepts the rest
- THEN only the accepted rows are written

#### Scenario: An analyst corrects a value before it is written

- GIVEN a preview holding a value the analyst wants to change
- WHEN they correct it and accept the row
- THEN the corrected value is written

#### Scenario: A correction the description would refuse

- GIVEN a preview
- WHEN the analyst corrects a value to something the collection's description does not allow
- THEN the write is refused
- AND the refusal says which field is wrong, as it would for a row typed by hand

#### Scenario: An approval the import cannot account for

- GIVEN an approval naming a row the import no longer proposes
- WHEN it is submitted
- THEN the import is refused
- AND nothing is written
- AND the refusal says the review is out of date

#### Scenario: A correction the import cannot account for

- GIVEN a correction addressed to a row the import no longer proposes
- WHEN it is submitted
- THEN the import is refused
- AND no row is written carrying the value that was corrected away
