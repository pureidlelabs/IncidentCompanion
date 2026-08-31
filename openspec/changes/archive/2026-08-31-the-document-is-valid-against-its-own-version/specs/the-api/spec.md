# the-api

## ADDED Requirements

### Requirement: The description is valid against the version it declares

The description of the interface SHALL declare which specification it conforms to, and SHALL be valid against that specification.

The declared version SHALL be the one the description's schemas are written in. Where the generator produces a dialect the declared version does not admit, the declaration is what is wrong.

A caller MUST be able to build a client from the description with a conforming generator, without editing it first.

#### Scenario: A schema uses a keyword the declared version has no spelling for

- GIVEN a description declaring one specification version
- WHEN a schema in it is emitted in a dialect that version does not admit
- THEN the description is refused as invalid
- AND the refusal names the schema and the keyword rather than reporting only that a client could not be built

#### Scenario: The generator's dialect moves

- GIVEN a change to what generates the schemas
- WHEN the dialect it emits no longer matches the declared version
- THEN this is detected before the description is served
- AND it is detected without a route having been added or changed

#### Scenario: A caller generates a client

- GIVEN a description the application serves
- WHEN a caller runs a conforming generator against it
- THEN a client is produced
- AND nothing in the description had to be edited by hand first
