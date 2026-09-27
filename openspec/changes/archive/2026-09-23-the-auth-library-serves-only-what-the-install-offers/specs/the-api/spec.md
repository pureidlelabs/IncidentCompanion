# The API

## MODIFIED Requirements

### Requirement: The interface describes itself, and the description is generated

A caller MUST be able to learn what the interface offers from the interface, and that description MUST be derived from what is actually served rather than maintained beside it. That includes every route a library the application mounts serves on its behalf: a route served and not described is one no client can be generated for and no check over the description reaches.

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

#### Scenario: A route served by a library the application mounts

- GIVEN a route the application serves through a library it mounts
- WHEN the description is fetched
- THEN the route is there, described as the library describes it
- AND a route the library defines and the application does not serve is not
