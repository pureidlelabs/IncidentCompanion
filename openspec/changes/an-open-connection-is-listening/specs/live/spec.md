# live

## ADDED Requirements

### Requirement: An open connection is listening

A connection the browser can write to MUST act on everything written over it, in the order it was written. Where the install has accepted a connection and is still preparing it, what arrives in the meantime MUST be held and acted on once it is ready, never discarded.

A screen's first frame is the one it waits on, so a connection that drops it silently leaves that screen waiting for an answer nothing will send. There is no error to show, nothing to retry, and no way for the analyst to tell that state from a slow one -- so this MUST NOT be left to a screen to notice or to a reload to clear.

This holds for every kind of frame and every connection, not only the first frame of the first one.

Where preparing the connection does not complete, the connection MUST end, and nothing written over it MUST be acted on -- an install that took a frame it can announce to nobody is worse than one that took none.

#### Scenario: A screen writes before the connection is ready

- GIVEN a connection the install has accepted and is still preparing
- WHEN a screen writes over it
- THEN the install acts on what it wrote once the connection is ready
- AND the screen is answered without being reloaded

#### Scenario: Preparing the connection does not complete

- GIVEN a screen that has written over a connection the install accepted
- WHEN preparing that connection fails
- THEN the connection ends
- AND nothing written over it is acted on

#### Scenario: Frames are acted on in the order sent

- GIVEN an analyst who claims an entry and releases it at once
- WHEN both reach the install
- THEN nothing is left held
