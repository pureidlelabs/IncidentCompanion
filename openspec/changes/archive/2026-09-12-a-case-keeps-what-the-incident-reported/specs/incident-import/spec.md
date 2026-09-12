# Incident import

## ADDED Requirements

### Requirement: A case opened from an incident keeps what the provider reported

Where an import opens a case, the case MUST carry the severity the provider reported for the incidents it was opened from, expressed in this product's own vocabulary.

A provider that raised the incident has already judged how bad it is, and that judgement is the best the install has until an analyst forms their own. Severity is what a case list is read by, so a case arriving unmarked is indistinguishable from one nobody has looked at.

The severity MUST be derived from the incidents in the request rather than taken from the caller. Every provider spells its ladder in its own words, and a caller composing a level is a caller deciding what this product's vocabulary means; where the two spellings disagree the whole act is refused over one field.

Where a case is opened from more than one incident, it MUST carry the worst severity any of them reported. An analyst corrects a case that reads too serious and does not open one that reads too mild.

Where no incident reported a severity this vocabulary can express, the case MUST be left unmarked. An import that chose a level would be asserting something the provider never said.

#### Scenario: An incident the provider judged

- GIVEN an analyst opening a case from an incident the provider reported as its second-highest level
- WHEN the case is created
- THEN the case is marked at this product's matching level

#### Scenario: One case from several incidents

- GIVEN an analyst opening one case from two incidents the provider reported at different levels
- WHEN the case is created
- THEN the case is marked at the worse of the two

#### Scenario: A level this vocabulary cannot express

- GIVEN an analyst opening a case from an incident whose reported severity is a word this product's vocabulary does not carry
- WHEN the case is created
- THEN the case exists, holds what was approved, and is left unmarked

#### Scenario: A caller naming the severity itself

- GIVEN a request to open a case that names a severity of its own
- WHEN the request is made
- THEN it is refused, and no case is opened
