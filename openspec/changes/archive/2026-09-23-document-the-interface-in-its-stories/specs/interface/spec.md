# The interface

## ADDED Requirements

### Requirement: A part's own documentation states what its caller owns

Every control and every composition MUST state what the caller has to supply, what it may not assume, and what the part refuses to do on its behalf.

A part that needs something it cannot derive is a part that fails silently when nobody supplies it. The failure looks like a styling mistake or an absent guard rather than a missing argument, so it is found by whoever ships it rather than by whoever wrote it.

That documentation MUST live where the part is defined, not in a file beside it. A second file describing the same part drifts from it, and is reached by no instrument that reads the code.

Documentation MUST NOT restate what the part's own types already say. What a property accepts is derivable; what a caller must do with it is not.

#### Scenario: A part needs something the caller must supply

- GIVEN a part that cannot derive some value it needs
- WHEN it is documented
- THEN the obligation on the caller is stated
- AND a failure to meet it is demonstrated rather than described

#### Scenario: A part is documented beside itself rather than within itself

- GIVEN documentation for a part
- WHEN it is written in a separate file rather than where the part is defined
- THEN that is caught

#### Scenario: A part's documented behaviour is not its actual behaviour

- GIVEN a claim made about how a part behaves
- WHEN the claim is one an examination could settle
- THEN it is settled by examination rather than by assertion

### Requirement: A composition is exercised as a composition

Every composition MUST demonstrate the dependencies between the parts it is assembled from, not only that each part draws.

A composition's defects are relationships: an action offered while the value it acts on is refused, a control that stays live while a write is in flight, a second submission accepted before the first is answered. Each part behaves correctly alone, and the composition does not.

Where a composition refuses something, the refusal MUST be demonstrated, and MUST be demonstrated as the analyst meets it rather than as the state that produces it.

#### Scenario: A composition refuses an action

- GIVEN a composition that will not act on some input
- WHEN it is exercised
- THEN the refusal is demonstrated by attempting the action
- AND the action is shown not to have happened

#### Scenario: A composition is mid-write

- GIVEN a composition with a write in flight
- WHEN it is exercised
- THEN what an analyst may still change is demonstrated

### Requirement: A screen is exercised at the extremes of what it may hold

Every screen MUST be exercisable with far less content than expected and with far more, and MUST NOT hold content of its own to be exercised at all.

A screen filled once, at a comfortable volume, is a screen whose layout has been judged at exactly one point. The volumes that break it are the ones an analyst reaches on a real case and nobody reaches while building it.

Content used to exercise a screen MUST come from outside the screen. A screen carrying its own is a screen that will eventually show that content to an analyst as though it were theirs.

#### Scenario: A screen is given almost nothing

- GIVEN a screen
- WHEN it is exercised with the least content it can be asked to draw
- THEN it can be, and what it draws is judged

#### Scenario: A screen is given far more than expected

- GIVEN a screen
- WHEN it is exercised with far more content than its author anticipated
- THEN it can be, and what it draws is judged

#### Scenario: A screen supplies its own content

- GIVEN a screen
- WHEN it holds the content used to exercise it
- THEN that is caught
