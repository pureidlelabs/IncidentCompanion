# The interface

## Purpose

What an analyst touches. This specification covers how the interface is built rather than what any screen shows: the layers it is made of, what each may know about the others, and the properties every control carries whether or not anybody remembered to give it them.

An incident is worked at speed, by somebody under pressure, often at three in the morning. The interface's job is to be the part of that which does not require attention.

## Requirements

### Requirement: The interface is layers, and each knows only what is beneath it

The interface MUST be built in layers, and a layer MUST NOT know about one above it.

- **Controls** — the things every screen is assembled from. They know nothing about this application.
- **Compositions** — controls arranged into something this application has a name for. They know what a thing looks like, not where its data comes from.
- **Screens** — what an analyst sees. They know what to draw from what they are given.
- **Containers** — what fetches, writes, and decides. They draw nothing.
- **Shared derivations** — what is true of a value regardless of who is looking at it. They know nothing about anything.

A layer that reaches upward MUST be a failure that is caught rather than a habit that is discouraged. Layering enforced by convention is layering that lasts until somebody is in a hurry, which is every time it matters.

#### Scenario: A control needs something from this application

- GIVEN a control in the lowest layer
- WHEN it needs to know something particular to this application
- THEN it takes it as an input rather than reaching for it

#### Scenario: A screen needs data

- GIVEN a screen that must show something it was not given
- WHEN it is built
- THEN a container fetches it and passes it down
- AND the screen does not reach for it

#### Scenario: A layer reaches upward

- GIVEN any layer
- WHEN it imports from one above it
- THEN that is caught

### Requirement: Controls come from one place, and nothing above it builds its own

Every control an analyst touches MUST come from the one layer that holds controls. Nothing above that layer MUST assemble its own from the underlying primitives.

A control assembled where it is needed is one nobody documented, nobody can find, and nobody will find again when they need the same thing — so they build a second, and the two diverge without either being wrong.

Where a screen needs something the layer does not have, it MUST be added there. Where two things nearly exist, one MUST be made to serve both rather than a third added beside them.

#### Scenario: A screen needs a control that does not exist

- GIVEN a screen needing something new
- WHEN it is built
- THEN it is added to the layer that holds controls
- AND the screen uses it from there

#### Scenario: Somebody reaches for a primitive directly

- GIVEN code above the controls layer
- WHEN it builds on the underlying primitive library directly
- THEN that is caught

#### Scenario: A second version of an existing control appears

- GIVEN a control that already exists
- WHEN something close to it is added beside it
- THEN that is caught

### Requirement: Accessibility is why the controls layer exists

The controls layer MUST be built on a foundation that supplies keyboard behaviour, focus management and the semantics assistive technology reads.

This is the reason the layer exists, not a property it happens to have. Hand-rolling a control means hand-rolling those, and they are the part whose absence nobody notices — until the person for whom they are the whole interface arrives.

Every control MUST be operable without a pointing device. An analyst MUST be able to reach, use and leave everything the interface offers from the keyboard alone.

Something that behaves like a control MUST be the thing it behaves like: what navigates is a link, what acts is a button, and neither MUST be dressed as the other.

#### Scenario: The interface is used without a pointer

- GIVEN any screen
- WHEN an analyst uses only the keyboard
- THEN everything on it can be reached, used and left

#### Scenario: Something looks like a button and navigates

- GIVEN a control that takes the analyst somewhere
- WHEN it is built
- THEN it is a link, whatever it looks like

#### Scenario: Focus moves into a layer over the screen

- GIVEN something that opens over the screen
- WHEN it opens
- THEN focus moves into it, stays within it, and returns when it closes

### Requirement: A screen draws; it does not fetch, and it does not place itself

A screen MUST render from what it is given. It MUST NOT fetch, and MUST NOT decide where on the page it sits.

Geometry belongs to whatever arranges screens. A screen that positions itself can only be placed one way, and the second place somebody wants it is where that is discovered.

Fetching belongs to containers. A screen that fetches cannot be shown in any state its author did not think to produce, which means the empty, loading and failed states are the ones nobody sees before an analyst does.

#### Scenario: A screen is shown in an unusual state

- GIVEN any screen
- WHEN it is shown with no data, with failed data, or with far more than expected
- THEN it can be, without a server

#### Scenario: A screen is placed somewhere else

- GIVEN a screen built for one place
- WHEN it is used in another
- THEN it needs no change

### Requirement: Every part can be seen on its own, in the states that matter

Every control and every composition MUST be exercisable in isolation, in each state it can actually be in.

For anything that presents data, that MUST include the states that are hard to reach in a running application and are therefore the ones nobody has looked at: empty, loading, failed, far too much data, and the longest text a real analyst would enter.

For anything that does not present data, it MUST include the states it does have — pressed, disabled, focused, invalid, and whatever else it distinguishes. A button has no empty state, and requiring one produces a fabricated story that proves nothing.

The data used to show a part in isolation MUST be a default rather than a source. A part MUST NOT hold example content that appears when nothing is passed to it, because that content will eventually be shown to an analyst as though it were theirs.

#### Scenario: A part that presents data is shown in isolation

- GIVEN a control or composition that presents data
- WHEN it is examined on its own
- THEN it can be seen empty, loading, failed, and holding far more than expected

#### Scenario: A part that presents no data is shown in isolation

- GIVEN a control with no data of its own
- WHEN it is examined on its own
- THEN it can be seen in each state it distinguishes
- AND is not given a state it does not have

#### Scenario: A part is given nothing

- GIVEN a part with example content used to show it in isolation
- WHEN it is rendered in the application with nothing passed
- THEN it shows nothing rather than the example

### Requirement: The interface has one vocabulary, and it is not invented per screen

Colour, spacing, type and motion MUST come from one named set, and a screen MUST NOT introduce its own values.

A name in that set MUST resolve. A value referred to and never defined renders as nothing, which looks like a design decision.

Meaning carried by colour MUST also be carried by something else, because colour alone is not available to every analyst and does not survive a printed page.

Motion MUST be proportionate and MUST be avoidable: an analyst who has asked their system for less of it MUST get less of it.

#### Scenario: A screen needs a value the set does not have

- GIVEN a screen needing a colour, measure or duration not in the set
- WHEN it is built
- THEN the value is added to the set
- AND not written into the screen

#### Scenario: A name does not resolve

- GIVEN a reference to a named value
- WHEN no such value is defined
- THEN that is caught rather than rendered as nothing

#### Scenario: An analyst has asked for less motion

- GIVEN an analyst whose system requests reduced motion
- WHEN they use the interface
- THEN it moves less

### Requirement: What two screens both need is derived once

Where two parts of the interface need the same answer about a value, that MUST be derived in one place, and that place MUST NOT know who is asking.

Two screens computing the same thing separately will disagree, and the disagreement will be about which is right rather than about which is stale.

#### Scenario: Two screens show the same derived answer

- GIVEN a value two screens both present
- WHEN it is derived
- THEN both take it from the same place

#### Scenario: A derivation needs to know its caller

- GIVEN a shared derivation
- WHEN it would need to know which screen is asking
- THEN it does not belong there
