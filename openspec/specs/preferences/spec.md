# Preferences

## Purpose

Two people share an install and do not share a screen. One reads timestamps in the timezone the incident happened in, the other in their own; one works in a dark room at three in the morning. This spec covers what an analyst may decide about how the application appears to them, how they are represented to the colleagues working the case beside them, and what an operator may decide for the whole install.

How an analyst appears while they are on a case belongs to the live spec, which owns presence. What the application looks like as a design belongs to the interface spec. This spec owns the settings themselves.

## Requirements

### Requirement: An analyst's own settings are theirs and reach nobody else

An analyst MUST be able to choose how the application appears to them, and those choices MUST NOT change what anybody else sees.

An install MUST be usable before an analyst has chosen anything. Where no choice has been recorded, the application MUST behave as though a stated default were chosen rather than as though something were missing.

A setting an analyst may not set MUST be refused rather than ignored. An unrecognised setting silently dropped is a preference that appears to have been saved and was not.

#### Scenario: An analyst has chosen nothing

- GIVEN an analyst who has never changed a setting
- WHEN they open the application
- THEN it appears as the stated default
- AND nothing reports a missing setting

#### Scenario: An analyst changes a setting

- GIVEN two analysts on one install
- WHEN one changes how the application appears to them
- THEN the other's view is unchanged

#### Scenario: A setting the application does not offer

- GIVEN a request to set something the application does not offer
- WHEN it is made
- THEN it is refused
- AND nothing is stored

### Requirement: How an analyst is represented is theirs, and only that is shared

An analyst MUST be able to choose how they are represented to the colleagues working beside them. What is shared with those colleagues MUST be only what is needed to recognise them, and MUST NOT include what they chose about how the application appears to their own eyes.

Nobody's appearance settings MUST be readable as a way of learning about them beyond being able to tell them apart.

#### Scenario: A colleague is drawn on a case

- GIVEN an analyst working a case beside a colleague
- WHEN the colleague is drawn
- THEN what is read is what is needed to recognise them
- AND how they have set the application to appear to themselves is not

### Requirement: An image an analyst supplies is never the image the application serves

Where an analyst supplies an image to represent themselves, the application MUST NOT serve back what it was given. It MUST produce its own image from what was supplied and serve that.

The application MUST decide what an image is from the content of the bytes rather than from what the sender says they are, and MUST refuse the image where the two disagree. A sender's description of their own upload is a claim, not a fact.

The application MUST accept only image formats it has named, and MUST NOT accept a format that can carry a program. An image is drawn wherever the analyst is drawn, and a format that executes turns every one of those places into somewhere else's code running under this install's origin.

#### Scenario: An analyst supplies an image

- GIVEN an analyst supplying an image to represent themselves
- WHEN it is stored and served back
- THEN what is served is the application's own re-encoding
- AND it is not the bytes that were supplied

#### Scenario: The bytes are not what the sender says

- GIVEN an upload whose declared format does not match the content of its bytes
- WHEN it is supplied
- THEN it is refused

#### Scenario: A format that can carry a program

- GIVEN an image in a format that can carry a program
- WHEN it is supplied
- THEN it is refused
- AND it is refused whatever the sender declared it to be

#### Scenario: Material carried alongside the picture

- GIVEN an image carrying material beyond the picture itself
- WHEN it is stored
- THEN what is served carries none of it

### Requirement: An upload is bounded before it is read, and a refusal says nothing useful to a sender

The application MUST bound what an upload may cost before it has paid the cost. Both the size of what is sent and the work of interpreting it MUST be bounded, because a small file can describe a very large image.

Where an upload is refused for being unusable, the refusal MUST NOT distinguish between the ways it was unusable. A sender learning which of several checks they failed is being helped to find the one that does not fire.

#### Scenario: An upload larger than the install accepts

- GIVEN an upload larger than the install accepts
- WHEN it is sent
- THEN it is refused before all of it has been read

#### Scenario: A small file describing an enormous image

- GIVEN a small file describing an image larger than the install will interpret
- WHEN it is supplied
- THEN it is refused
- AND the install did not attempt to interpret it

#### Scenario: Two uploads fail for different reasons

- GIVEN two unusable uploads that fail for different reasons
- WHEN each is refused
- THEN the refusals do not distinguish which reason applied

### Requirement: The application's own marks are readable before anybody has signed in

The application MUST serve the marks that identify it — what a browser draws in a tab, what a sign-in screen shows — without a session, because they are drawn before anybody has one.

The marks MUST say nothing about the install beyond identifying the application. Nothing about who uses it, what it holds, or how it is configured MUST be readable from them.

What else is readable without a session is not this specification's to decide. The reference spec owns the open door, and the deployment spec owns whether an install can be asked if it is well.

#### Scenario: A browser opens the application

- GIVEN a browser opening the install with no session
- WHEN it asks for the marks that identify the application
- THEN they are served

#### Scenario: The marks are read for what they disclose

- GIVEN the marks an install serves without a session
- WHEN they are read
- THEN they say nothing about who uses the install or what it holds

### Requirement: What an install decides is a closed set, and changing one is an administrative act

An install MUST hold its own settings separately from any analyst's, and the set of them MUST be closed. An operator MUST NOT be able to introduce a setting the application does not recognise, because a setting nothing reads is one an operator believes is in force.

Changing an install setting MUST be an administrative act, MUST be refused to anybody who is not an administrator, and MUST be recorded as an administrative event.

Reading which settings are in force MAY be available to any analyst, because a setting that changes what the application asks them for is one they can see the effect of anyway.

#### Scenario: An operator sets something the install does not recognise

- GIVEN a request to change a setting the install does not recognise
- WHEN it is made
- THEN it is refused

#### Scenario: An analyst who is not an administrator changes an install setting

- GIVEN an analyst who is not an administrator
- WHEN they attempt to change an install setting
- THEN it is refused

#### Scenario: An install setting is changed

- GIVEN an administrator changing an install setting
- WHEN the change is made
- THEN it is recorded as an administrative event
