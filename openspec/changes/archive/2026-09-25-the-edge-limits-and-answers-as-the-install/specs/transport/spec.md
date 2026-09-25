# Transport

## MODIFIED Requirements

### Requirement: The browser is told what the application may do, on every response

Every response MUST carry a content policy, and the policy MUST be the same whether the response is the application itself or an answer from its interface. A policy carried by only one of the two protects only one of them, and an analyst meets both.

The policy MUST permit code only from the install itself. It MUST NOT permit code built from text at run time, and it MUST NOT name a third party as a source of anything, because Article V means there is no third party to name.

Where the application needs the browser to reach somewhere that is not the install, the policy MUST name that destination exactly. It MUST NOT be widened to a pattern, and every destination it names MUST be one the operator has chosen to point the install at. A source that names a scheme on its own is a pattern: it matches every host speaking that scheme.

Every response MUST also tell the browser not to guess at what it has been sent.

**An answer the install gives without the application is a response too** — a refusal before the application is asked, a request it cannot read, the application unreachable. It MUST carry a policy that permits nothing and refuses to be framed, and MUST tell the browser not to guess. No answer MUST name the version of the software that wrote it.

#### Scenario: A response is read by a browser

- GIVEN any response from the install, whether a page or an answer from the interface
- WHEN a browser reads it
- THEN it carries a content policy
- AND the policy is the same one in both cases

#### Scenario: The install answers without the application

- GIVEN a request the install answers without the application, refused or with the application unreachable
- WHEN a browser reads the answer
- THEN it carries a content policy that permits nothing and refuses to be framed
- AND it tells the browser not to guess at what it was sent
- AND it names no software version

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
