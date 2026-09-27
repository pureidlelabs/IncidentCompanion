# Deployment

## MODIFIED Requirements

### Requirement: Setting up is separate from running, and runs once

Work that prepares an install — creating the identities the application uses, applying the shape of the store, putting demonstration content in — MUST be done by something other than the application, and MUST complete before the application starts.

Each MUST be safe to run again. An install that is started twice MUST NOT do its preparation twice.

The application MUST NOT hold the ability to do any of it. Preparation and serving are different powers, and combining them means the running application can change the shape of its own store.

Applying the shape of the store MUST be one act that either completes or changes nothing. Run again beside a serving application, it MUST NOT let that application meet the store without the rules that decide what it may read. A shape that would discard or convert what is stored MUST be refused, leaving the store exactly as it was, and the outcome MUST NOT depend on whether anybody is watching a terminal.

#### Scenario: Preparation runs before serving

- GIVEN a first start
- WHEN the install comes up
- THEN the preparation completed before the application began serving

#### Scenario: An install is started again

- GIVEN an install that has been prepared
- WHEN it is started again
- THEN the preparation does not repeat its work
- AND nothing it created is replaced

#### Scenario: Preparation fails

- GIVEN preparation that cannot complete
- WHEN the install starts
- THEN the application does not serve
- AND what failed is apparent

#### Scenario: Preparation runs again beside a serving application

- GIVEN a serving install holding cases
- WHEN its preparation runs again
- THEN every answer the application gives meanwhile is the one it would give otherwise
- AND nothing preparation made earlier is replaced

#### Scenario: A new version would discard stored data

- GIVEN an install holding data
- WHEN it is started on a version whose shape of the store would discard or convert some of it
- THEN preparation refuses
- AND the store is exactly as it was
- AND the application keeps answering as it did
- AND what was refused is apparent, naming what would have been lost

#### Scenario: Preparation is run by hand

- GIVEN a shape of the store that would discard stored data
- WHEN preparation is run from an interactive terminal
- THEN the outcome is the one it has unattended

### Requirement: An install can say whether it is well, and what is wrong

An install MUST be able to report whether it is serving, and MUST distinguish *started* from *serving*: a component that has begun and cannot yet answer is not ready, and treating it as ready is how a start reports success onto a broken install.

Where a part is unwell, what is wrong MUST be nameable without reading a log — which store, which dependency, which piece of preparation.

An install MUST NOT report itself well while a component it needs is not.

A component that stops without being asked to MUST be started again without anybody acting, and an install whose dependency returns MUST serve again without anybody acting.

#### Scenario: A component has started but cannot answer

- GIVEN a component that is running and not yet able to serve
- WHEN the install is asked whether it is well
- THEN it says it is not
- AND names what is not ready

#### Scenario: A dependency fails while running

- GIVEN a healthy install
- WHEN a store it depends on becomes unreachable
- THEN the install reports itself unwell
- AND says which
- AND once it is reachable again, the install serves without anybody acting

#### Scenario: A component stops unexpectedly

- GIVEN a serving install
- WHEN one of its components stops without being asked to
- THEN it is started again without anybody acting
- AND nothing stored is lost

## ADDED Requirements

### Requirement: An install with nothing configured reaches nothing outside itself

An install nobody has pointed at anything MUST make no request to anything outside itself, at any moment of its life: starting, preparing, serving, restarting, being copied and being returned to. This is Article V held for the install as a whole, so a part that is not a feature — a preparation step, a tool one of them runs — is held to it too.

#### Scenario: An install lives its whole life with nothing configured

- GIVEN an install nobody has pointed at anything
- WHEN it is started, prepared, used, restarted, copied and returned to
- THEN no part of it, preparation included, makes a request to anything outside the install
