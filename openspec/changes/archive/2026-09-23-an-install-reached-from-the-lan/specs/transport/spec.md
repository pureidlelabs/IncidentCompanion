# Transport

## MODIFIED Requirements

### Requirement: The browser is told what the application may do, on every response

Every response MUST carry a content policy, and the policy MUST be the same whether the response is the application itself or an answer from its interface. A policy carried by only one of the two protects only one of them, and an analyst meets both.

The policy MUST permit code only from the install itself. It MUST NOT permit code built from text at run time, and it MUST NOT name a third party as a source of anything, because Article V means there is no third party to name.

Where the application needs the browser to reach somewhere that is not the install, the policy MUST name that destination exactly. It MUST NOT be widened to a pattern, and every destination it names MUST be one the operator has chosen to point the install at. A source that names a scheme on its own is a pattern: it matches every host speaking that scheme.

Every response MUST also tell the browser not to guess at what it has been sent.

#### Scenario: A response is read by a browser

- GIVEN any response from the install, whether a page or an answer from the interface
- WHEN a browser reads it
- THEN it carries a content policy
- AND the policy is the same one in both cases

#### Scenario: The policy is read for what it permits

- GIVEN the content policy the install sends
- WHEN it is read
- THEN it permits code only from the install itself
- AND it does not permit code built from text at run time

#### Scenario: The browser must reach the analyst's identity provider

- GIVEN an install pointed at the organisation's own identity provider
- WHEN the policy is read
- THEN it names that destination exactly
- AND it names no pattern that would match anywhere else

#### Scenario: An install pointed at nothing outside itself

- GIVEN an install with nothing configured
- WHEN the policy is read
- THEN it names no destination outside the install
- AND no source that would match any host, a scheme on its own included

#### Scenario: The analyst's browser must reach an import platform

- GIVEN an install whose operator turned importing from a platform on
- WHEN the policy is read
- THEN it names that platform's destinations exactly

### Requirement: The application answers only to itself

The application MUST decide which origins are its own, and MUST treat a request presented as coming from anywhere else as coming from somewhere else. The set MUST be derived from where the install is actually reached rather than configured separately, so it cannot drift from reality.

An ordinary request and a socket MUST be admitted by the same set.

Where the install is reached at a loopback address, every spelling of that address MUST be accepted, because a browser and an operator will not agree on which one to write.

The set MUST NOT be widened by scheme or by port. An install reached over a protected connection MUST NOT accept the unprotected spelling of itself, and MUST NOT accept another port on the same host.

Where the install cannot work out where it is reached, it MUST answer that it trusts nothing rather than guess.

#### Scenario: The install is reached at a loopback address

- GIVEN an install reached at a loopback address
- WHEN the trusted set is read
- THEN every spelling of that loopback address at the same scheme and port is in it

#### Scenario: The unprotected spelling of the install

- GIVEN an install reached over a protected connection
- WHEN a request presents the unprotected spelling of the same host as its origin
- THEN it is not treated as the install's own

#### Scenario: Another port on the same host

- GIVEN an install reached on one port
- WHEN a request presents the same host at another port
- THEN it is not treated as the install's own

#### Scenario: The install cannot tell where it is

- GIVEN an install that cannot work out the address it is reached at
- WHEN the trusted set is read
- THEN it is empty
- AND nothing is trusted by default

#### Scenario: A socket is opened from the unprotected spelling of the install

- GIVEN an install reached over a protected connection at a name of its own
- WHEN a socket is opened presenting the unprotected spelling of that name as its origin
- THEN it is refused, as an ordinary request from that origin is
