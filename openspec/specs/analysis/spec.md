# Analysis

## Purpose

A case accumulates rows faster than anybody can hold in their head. What an analyst needs from it is not the rows but the shape: what reached what, in which order, how far through an intrusion the attacker got, and where the gaps are.

This spec covers the views that answer those questions from what the case already holds — the picture of the intrusion, the placement of activity along a published model of an attack, the narrowing of a case to a stretch of time, and finding a value anywhere in a case. It does not cover what the case holds, which is the collections spec, nor what a report says about any of it, which is the report spec.

## Requirements

### Requirement: Every view is derived from the case, and none of them is a second record

A view MUST be computed from what the case already holds. An analyst MUST NOT be asked to maintain it, and MUST NOT be able to put it out of step with the case.

Nothing a view shows MUST be stored as its own answer where the case already carries what it is derived from. A stored answer is a second description of the case, and it goes stale the first time somebody edits the row underneath it.

#### Scenario: A row is edited

- GIVEN a case whose views an analyst has been reading
- WHEN a row underlying them is edited
- THEN the views show the change
- AND nothing had to be rebuilt by hand

#### Scenario: An analyst is asked to maintain a view

- GIVEN any view over a case
- WHEN an analyst works the case
- THEN they are never asked to fill in what the view shows

### Requirement: Where an attack had got to is derived from what the analyst already recorded

An analyst records what an attacker did in the published vocabulary their industry uses. How far through an intrusion that puts them MUST be derived from what was recorded rather than asked for separately, because a second field saying the same thing is double entry, and double entry is how two fields come to disagree.

The model an install places activity against MUST be a published one, and MUST be named. An install placing activity against a model of its own invention produces a picture nobody outside it can read.

Where the recorded activity is specific enough to say more than the general case, the more specific reading MUST win.

An analyst MUST be able to override the derivation. The derivation is an inference, the analyst was there, and there are stages of an intrusion no vocabulary of technique will ever imply.

#### Scenario: An analyst records what an attacker did

- GIVEN an analyst recording an attacker's activity in the published vocabulary
- WHEN the case is read
- THEN where that puts the attacker in the attack is shown
- AND the analyst was not asked for it separately

#### Scenario: A more specific reading is available

- GIVEN activity recorded both generally and specifically
- WHEN the placement is derived
- THEN the more specific reading is used

#### Scenario: An analyst disagrees with the derivation

- GIVEN a derived placement the analyst knows to be wrong
- WHEN they override it
- THEN their placement is used
- AND it is not overwritten by the derivation

#### Scenario: A stage nothing implies

- GIVEN a stage of an intrusion that no recorded technique implies
- WHEN an analyst places activity there
- THEN they may, by saying so

### Requirement: The picture is of the intrusion, not of the case file

The picture an analyst reads MUST show what the intrusion touched and how it moved between those things.

An entry recording that something happened MUST NOT itself be drawn as a thing in the picture. Drawing every event alongside every host produces a picture of the case file rather than of the intrusion, and the analyst has to find the intrusion inside it.

The analyst's own working-out MUST NOT be in the picture. What an analyst did to investigate is not something the attacker touched, and mixing the two makes the picture a record of two different activities.

An analyst MUST be able to take something out of the picture, because a case always holds something true and unilluminating.

#### Scenario: A case with many recorded events

- GIVEN a case holding many events between a few hosts
- WHEN the picture is drawn
- THEN the hosts are drawn and the events are the movement between them

#### Scenario: The analyst's own working-out

- GIVEN a case recording how the analyst investigated it
- WHEN the picture is drawn
- THEN that working-out is not in it

#### Scenario: An analyst removes something from the picture

- GIVEN something in the case the analyst does not want drawn
- WHEN they take it out of the picture
- THEN it is not drawn
- AND it is still in the case

#### Scenario: Something is referred to that is not there

- GIVEN a row referring to something the case no longer holds
- WHEN the picture is drawn
- THEN nothing is drawn for it
- AND the picture is still drawn

### Requirement: A case can be narrowed to a stretch of time, and the narrowing is a view

An analyst MUST be able to narrow a case to a stretch of time and have every view of it answer for that stretch.

Narrowing MUST be a way of looking rather than a change to the case. Nothing MUST be removed, and leaving the narrowing MUST restore what was there.

The stretch an analyst may choose MUST be bounded by what the case actually spans, so that an analyst is not asked to find their incident inside an arbitrary calendar.

#### Scenario: An analyst narrows a case to a stretch of time

- GIVEN a case spanning several days
- WHEN the analyst narrows it to a few hours
- THEN what they are shown answers for those hours

#### Scenario: The narrowing is removed

- GIVEN a narrowed case
- WHEN the analyst removes the narrowing
- THEN everything is shown again
- AND nothing was lost

### Requirement: A value can be found anywhere in the case

An analyst holding one value — an address, a name, a hash — MUST be able to find everywhere in the case it appears, without knowing which collection to look in.

A search MUST NOT reach outside the case it is made in.

#### Scenario: An analyst searches for a value

- GIVEN a value appearing in several of a case's collections
- WHEN the analyst searches the case for it
- THEN they are shown everywhere it appears

#### Scenario: The value appears in another case

- GIVEN a value appearing in a different case
- WHEN an analyst searches this case for it
- THEN the other case's rows are not shown
