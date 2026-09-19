# Report

## ADDED Requirements

### Requirement: A report filed under a regime records which step of it the report is

Where a regime's obligation is discharged in steps, a layout that exists to file one of those steps MUST state which step it is, and a report created from that layout MUST record it without asking the analyst to restate what they have just chosen.

The step MUST be a value of the vocabulary the report's stage is validated against, so that what a layout claims and what a report can hold cannot disagree.

The step MUST be declared rather than derived from the layout's title. A title is content an operator edits and an analyst's own layout carries whatever they called it, so a step read from one is a guess that fails silently on the layout whose title is not a stage.

A layout that belongs to no regime MUST state no step, because there is no obligation for it to be a step of.

#### Scenario: A filing is created from the layout that files it

- GIVEN an install that assesses a regime whose obligation is discharged in steps
- WHEN an analyst creates a report from the layout for one of those steps
- THEN the report records that step
- AND the analyst is not asked which step it is

#### Scenario: A layout whose title is not the name of a step

- GIVEN a regulatory layout whose title differs from the step it files
- WHEN a report is created from it
- THEN the step recorded is the one the layout declares
- AND it is a value the report's stage vocabulary holds

#### Scenario: An ordinary layout

- GIVEN a layout belonging to no regime
- WHEN a report is created from it
- THEN the report records no step

#### Scenario: The install does not assess the regime

- GIVEN an install that does not assess a regime
- WHEN the layouts on offer are read
- THEN no step is offered for a report, the layouts of that regime not being on offer at all
