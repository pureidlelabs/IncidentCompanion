# Incident import

## Purpose

An incident usually exists somewhere before it exists here. A detection platform raised it, an analyst triaged it there, and the work of building a root cause analysis starts by bringing what that platform already knows into a case.

This spec covers what an import may do: where the incident's data comes from, what an analyst approves before anything is written, how imported rows are matched against what the case already holds, and what an imported row carries that an analyst-written one does not.

What a case holds and how a write to it is checked belongs to the collections spec. Who may reach the case being written to belongs to the accounts and access spec. Bringing a whole case in and out of an install is the case archive spec, which is a different act with a different purpose.

## Requirements

### Requirement: The install reaches nobody's platform on its own account

An install MUST NOT make an outbound request to a detection platform. Where an incident is brought in from one, the analyst's browser MUST be what talks to that platform, using a credential the analyst holds, and the install MUST receive only what the analyst's browser sends it.

An install with no connection configured MUST make no request to any platform at all, and MUST remain fully usable for cases created by hand.

This is Article V read against a product whose whole purpose is to reach data an operator already owns. The platform is the operator's own tenant, so the boundary is not crossed by the data arriving; it would be crossed by the install holding a credential to fetch it unattended.

#### Scenario: An install with no connection configured

- GIVEN an install where no detection platform has been configured
- WHEN it runs
- THEN it makes no request to any platform
- AND cases can still be created and worked by hand

#### Scenario: The analyst's credential is used, not the install's

- GIVEN an analyst importing an incident from a detection platform
- WHEN the platform is queried
- THEN the request is made by the analyst's browser under the analyst's own credential
- AND the install holds no credential for that platform

#### Scenario: A credential is not kept

- GIVEN an analyst who has signed in to a detection platform to import from it
- WHEN their browser session ends
- THEN the credential is gone
- AND what remains is only enough to identify which platform to offer next time

#### Scenario: A credential goes only where it was issued for

- GIVEN a credential for a detection platform
- AND a location to fetch the next page of results, named by that platform in its own response
- WHEN the next page is fetched
- THEN the credential is sent only if that location belongs to the platform it was issued for
- AND a location naming anywhere else is refused

### Requirement: Nothing is written until an analyst has approved it

An import MUST show the analyst what it proposes to write before writing any of it. Each proposed row MUST be individually approvable, and the analyst MUST be able to correct a value before it is written.

An analyst MUST be able to decline a proposed row, and declining MUST be possible without abandoning the rest of the import.

A correction the analyst makes MUST be checked against the same description that governs a row written by hand. An import MUST NOT be a way to put a value into a case that the analyst could not have typed.

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

### Requirement: An import is matched against what the case already holds

An import MUST decide whether each proposed row is something the case already holds or something new, and MUST show the analyst which it is.

The decision MUST be made against what the case holds at the moment of import rather than against anything the analyst's browser was told earlier, so that a row another analyst added while the import was being reviewed is still recognised.

Only collections that have an identity can be matched this way. For a collection whose rows are events rather than things, every imported row MUST be a new row.

#### Scenario: An imported thing is already in the case

- GIVEN a case already holding a host
- WHEN an import proposes that same host
- THEN the analyst is shown that it already exists
- AND accepting it does not create a second one

#### Scenario: The case changed while the import was reviewed

- GIVEN a preview taken before another analyst added a host
- WHEN the import is accepted
- THEN the host they added is recognised as existing
- AND it is not duplicated

#### Scenario: An event is imported twice

- GIVEN a collection whose rows are events rather than things
- WHEN the same import is accepted twice
- THEN two rows exist
- AND neither is treated as a duplicate of the other

### Requirement: An imported row says that it was imported, and that nobody has read it

A row written by an import MUST carry where it came from, and MUST be distinguishable from a row an analyst wrote. An analyst reading a case MUST be able to tell which of it is their own work and which arrived from a platform.

An imported row MUST also carry that no analyst has yet reviewed it, so that material nobody has read is not mistaken for material somebody has.

What a row carries about its own origin MUST be decided by the install rather than taken from the platform's data, so that a platform cannot describe a row as anything other than imported.

#### Scenario: An imported row is read back

- GIVEN a row written by an import
- WHEN an analyst reads it
- THEN it says which platform it came from
- AND it says that nobody has reviewed it yet

#### Scenario: A platform's data claims to be something else

- GIVEN incoming data that names its own origin, or claims to have been reviewed
- WHEN it is written
- THEN what the row says about its origin is what the install determined
- AND the incoming claim is not used

#### Scenario: An analyst reviews an imported row

- GIVEN an imported row nobody has reviewed
- WHEN an analyst reviews it
- THEN it no longer says that nobody has

### Requirement: What could not be brought in is counted rather than dropped

Where an import cannot map something the platform sent, it MUST say so and MUST say how much. An import MUST NOT silently discard material.

An import MUST distinguish material it did not recognise from material it recognised and could not use, because those tell the analyst different things about whether the case is complete.

A single unmappable item MUST NOT abandon the import.

#### Scenario: The platform sends something unrecognised

- GIVEN an incident holding a kind of entity this install does not map
- WHEN it is imported
- THEN the rest of the incident is still imported
- AND the analyst is told how many items were not recognised

#### Scenario: An analyst asks what was left behind

- GIVEN a completed import that could not bring everything in
- WHEN the analyst looks at the result
- THEN what was not recognised and what could not be used are counted separately

### Requirement: A failed import never leaves a case behind

Where an import is asked to create the case as well as fill it, creating the case and filling it MUST be one act. A failure MUST leave no case.

An empty case nobody meant to create is offered in every list from then on, and nothing distinguishes it from one an analyst opened and abandoned. The analyst who has to decide what to pick up is the person who pays for it, and they pay every time they look at the list rather than once.

#### Scenario: An import asked to create a case fails

- GIVEN an import asked to create a case and fill it
- WHEN any part of it fails
- THEN no case was created

#### Scenario: An import asked to create a case succeeds

- GIVEN an import asked to create a case and fill it
- WHEN it succeeds
- THEN the case exists and holds what was approved

### Requirement: An import that failed partway can be run again without doing it twice

An import writes to more than one collection, and the later writes name what the earlier ones produced. Where a later part fails, what was already written MAY remain.

What MUST hold is that running the same import again finishes the job rather than doubling it. The analyst MUST be able to retry into the same case, and MUST NOT have to work out what landed before the failure — that means reading the case against the platform's screen row by row, which is the labour the import exists to remove, and asking for it exactly when something has already gone wrong.

An import that has partly written MUST say so rather than report success, and MUST say what reached the case.

#### Scenario: An import fails partway and is run again

- GIVEN an import that wrote some rows before failing
- WHEN the analyst runs the same import into the same case again
- THEN what was already written is recognised rather than written twice
- AND what was missing is written

#### Scenario: A partly written import is reported

- GIVEN an import that wrote some rows before failing
- WHEN it returns
- THEN it does not report success
- AND it says what reached the case
