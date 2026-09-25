# Live

## ADDED Requirements

### Requirement: Words the install cannot yet store are said to be unsaved

Where a save of written prose fails, every analyst with that prose open MUST be told that the words are not saved yet and that the install is holding them, while they can still act on it, and MUST be offered the text to copy. Nothing MUST be locked by it: whoever can write goes on writing.

Once a save stores the words, the notice MUST go.

Where the words can no longer be stored, or an analyst is about to leave with them unsaved, they MUST be told so and offered the copy again.

#### Scenario: A save of written words fails

- GIVEN analysts with a passage open
- WHEN what was written into it cannot be stored
- THEN each of them is told the words are not saved yet
- AND each is offered the text to copy
- AND they can go on writing

#### Scenario: The words are stored after all

- GIVEN analysts told their words are not saved yet
- WHEN a later save stores them
- THEN the notice goes

#### Scenario: A passage is opened while its words are unsaved

- GIVEN words the install holds unsaved
- WHEN an analyst opens the passage
- THEN they are told the words are not saved yet

#### Scenario: The words can no longer be stored

- GIVEN words the install holds unsaved
- WHEN they can no longer be stored
- THEN the analysts with the passage open are told they are given up
- AND offered the text to copy again

#### Scenario: An analyst leaves with the words unsaved

- GIVEN an analyst told their words are not saved yet
- WHEN they go to leave the passage
- THEN they are asked first
- AND offered the text to copy
