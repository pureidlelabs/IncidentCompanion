# The API

## Purpose

Everything this application does, it does through one interface. The screens are a consumer of that interface and hold no privilege the interface does not grant, so a capability the API cannot express is a capability the product does not have.

This specification covers the interface as a thing in its own right: how a caller asks, what it gets, how it learns what is available, what happens when two callers collide, and what a refusal means. What any particular route is *about* belongs to that capability's specification.

## Requirements

### Requirement: The interface is the product, and the screens are a consumer

Every capability MUST be reachable through the interface. A screen MUST NOT be able to do anything a caller with the same reach could not do by other means, and MUST NOT hold a private path.

This is not a promise of a public API. It is a constraint on where behaviour lives: a rule enforced only in a screen is a rule nobody else obeys.

#### Scenario: A screen does something no caller can

- GIVEN a capability offered by a screen
- WHEN a caller with the same reach asks for it directly
- THEN it is available to them

#### Scenario: A rule is enforced only in the client

- GIVEN a constraint on what an analyst may record
- WHEN a caller submits a value the screen would refuse
- THEN the interface refuses it too

### Requirement: A caller asks for what it needs and receives no more

What a caller receives MUST be a consequence of what it asked for, not of what the underlying record happens to hold. Adding a field to a stored thing MUST NOT enlarge every response that mentions it.

A caller MUST be able to ask for one thing without receiving everything that hangs off it, and MUST be able to ask for a whole thing deliberately when that is what it wants.

#### Scenario: A screen needs a handful of fields

- GIVEN a screen rendering a list of names and dates
- WHEN it asks the interface for them
- THEN it receives those fields
- AND not the whole of each record

#### Scenario: A record grows a field

- GIVEN callers reading a record
- WHEN a new field is added to what is stored
- THEN no caller's response grows unless it asked for that field

#### Scenario: A caller wants everything

- GIVEN a caller that genuinely needs a whole case
- WHEN it asks for the whole case
- THEN it receives it
- AND the request is distinguishable from one that wanted a fragment

### Requirement: Reach is enforced where the data is, not where the request arrives

Whether a caller may see a row MUST be enforced by the store that holds it, so that a request the interface did not anticipate cannot reach a row the caller may not see.

An entry-point check is necessary and MUST NOT be the only one. Where a caller can compose the shape of its own request, an entry-point check protects the shapes somebody thought of.

#### Scenario: A caller composes a request nobody anticipated

- GIVEN a caller that can shape its own request
- WHEN it asks for rows across a boundary it may not cross
- THEN the store returns nothing it may not see
- AND the refusal does not depend on the interface having expected that request

#### Scenario: A new way to read a record is added

- GIVEN a record already protected by reach
- WHEN a further way to read it is added to the interface
- THEN it is protected without anybody adding a check
- AND omitting the check is not something a reviewer must catch

### Requirement: A read tells a caller what it is looking at

Anything a caller may later change MUST arrive carrying what a write will be checked against, so that a caller which read, thought, and then wrote can be told that the ground moved.

#### Scenario: A caller reads and later writes

- GIVEN a caller that read a record
- WHEN it writes back what it read against
- THEN the write is accepted only where nothing changed underneath it

#### Scenario: Somebody wrote first

- GIVEN two callers that read the same record
- WHEN the second writes after the first
- THEN it is refused
- AND told what the record is on now, so it can work out what changed

### Requirement: The interface describes itself, and the description is generated

A caller MUST be able to learn what the interface offers from the interface, and that description MUST be derived from what is actually served rather than maintained beside it.

The description MUST be organised the way somebody thinks about the product, not the way the routes happen to be arranged.

#### Scenario: A route is added

- GIVEN a new route
- WHEN the description is fetched
- THEN it is there, without anybody having written it down twice

#### Scenario: A route changes shape

- GIVEN a route whose accepted shape changes
- WHEN the description is fetched
- THEN it describes the new shape
- AND a caller built against the old one can tell what moved

### Requirement: A refusal says which of the caller's problems it is

A refusal MUST distinguish: the caller is not who it says, the caller may not do this, the request is malformed, the thing is not there, somebody wrote first, and the caller is asking too often.

A refusal MUST NOT disclose the existence of something the caller may not reach. Not there and not yours MUST be indistinguishable.

A refusal is a reference entry for somebody writing a client. It names the condition and the field that discriminates it, and offers no advice.

#### Scenario: A caller asks for something out of reach

- GIVEN a caller without reach to a customer
- WHEN it asks for one of that customer's cases, by an identifier that exists
- THEN the refusal is identical to one for an identifier that does not

#### Scenario: A caller sends a body the interface cannot accept

- GIVEN a malformed request
- WHEN it is refused
- THEN the refusal names what was wrong with it

### Requirement: What a request costs is bounded before it runs

The work a single request can demand MUST be bounded, and the bound MUST be enforced before the work starts rather than by noticing it took too long.

A caller that can shape its own request can shape an expensive one, whether or not it means to.

#### Scenario: A caller asks for too much at once

- GIVEN a request whose cost exceeds what the install permits
- WHEN it arrives
- THEN it is refused before the work begins
- AND the refusal says it was too expensive, not that it timed out

#### Scenario: A caller asks too often

- GIVEN a caller exceeding what the install permits
- WHEN it makes a further request
- THEN it is refused
- AND told when it may try again

### Requirement: A fact can be asked for across cases

An analyst MUST be able to ask the application a question that spans cases rather than opening each one: whether an indicator has been seen before, which investigations touched a system, what a customer's history holds.

An answer MUST contain only what the asker reaches. A question spanning cases MUST NOT become a way to learn that a case exists in a customer the asker does not reach — including by counting, timing, or the shape of what comes back.

#### Scenario: An indicator is asked about across cases

- GIVEN an indicator recorded in cases belonging to several customers
- WHEN an analyst asks where it has been seen
- THEN they are told about the cases they reach
- AND nothing indicates that others exist

#### Scenario: A question spans a boundary

- GIVEN an analyst reaching one customer
- WHEN they ask a question that would match rows in another
- THEN the answer is identical to one where those rows did not exist
- AND no count, total or duration reveals them

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
