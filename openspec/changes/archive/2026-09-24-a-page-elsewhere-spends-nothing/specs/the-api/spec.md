# The API

## MODIFIED Requirements

### Requirement: What a request costs is bounded before it runs

The work a single request can demand MUST be bounded, and the bound MUST be enforced before the work starts rather than by noticing it took too long.

A caller that can shape its own request can shape an expensive one, whether or not it means to.

A limit on how often a caller may ask MUST be that caller's own. Another caller spending theirs MUST NOT refuse it, and neither MUST a page on another site sending requests through the analyst's browser.

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

#### Scenario: Another caller asks too often

- GIVEN a caller refused for asking too often
- WHEN a caller on another machine asks
- THEN it is served

#### Scenario: A page on another site asks on the analyst's behalf

- GIVEN a page on another site open in the analyst's browser
- WHEN it sends sign-in requests to the install
- THEN each is refused
- AND the analyst's own next attempt is not refused for asking too often

#### Scenario: A page on another site calls the install on the analyst's behalf

- GIVEN a page on another site open in the analyst's browser
- WHEN it fetches from the install, and draws from it, more often than the install permits one caller
- THEN each is refused
- AND the analyst's own next request is served
- AND a link from that page still opens the install
