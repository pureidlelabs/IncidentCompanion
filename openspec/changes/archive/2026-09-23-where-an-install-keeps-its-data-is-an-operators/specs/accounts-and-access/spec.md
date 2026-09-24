# accounts-and-access

## MODIFIED Requirements

### Requirement: What the install is made of is management-plane

The size and shape of the installation and the resources of the host it runs on MUST be reachable by an administrator alone.

That is its storage and how much it holds there, its open connections, how many rows each of its tables holds, and the memory, processor and free space available to it. None of it is what a case holds, and none of it is an account's own.

**A count of rows answers the question the route beside it refuses.** Who may sign in is management-plane, so the account list is an administrator's; a per-table row count reports how many accounts exist without naming them. A boundary one route holds and the table beside it reports around is not held.

**The liveness probe is the exception, and it is the only one.** Whether the application can serve a request at all MUST be answerable without a session, because an answer that needs one cannot be given by an install that has stopped serving. It MUST report only that, and MUST NOT carry the install's size, shape or host resources.

Where a screen is drawn for these facts, it MUST NOT be offered to an account that every route behind it refuses.

#### Scenario: An analyst asks what the install holds

- GIVEN an account signed in as an analyst
- WHEN they request where the install keeps its data, how many artefacts it holds, or its table sizes and row counts
- THEN they are refused

#### Scenario: An analyst asks what the host has left

- GIVEN an account signed in as an analyst
- WHEN they request the host's memory, processor and free space
- THEN they are refused

#### Scenario: An administrator asks the same questions

- GIVEN an account signed in as an administrator
- WHEN they request either
- THEN they are answered

#### Scenario: The rail offers a pane nobody behind it would answer

- GIVEN an account signed in as an analyst
- WHEN they are offered the panes they may open
- THEN the pane drawn from install telemetry is not among them

#### Scenario: Something asks whether the install is serving

- GIVEN a caller with no session
- WHEN it asks whether the application is live
- THEN it is answered
- AND the answer carries nothing about the install's size, shape or host resources
