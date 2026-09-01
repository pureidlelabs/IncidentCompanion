# Transport

## Purpose

The application is reached through a browser, and a browser will do what a page tells it to. What this install tells the browser is a security boundary in its own right: which code may run, who may embed the application, what may be kept on disk, and which requests the application will treat as coming from itself.

This spec covers what every response carries and why, which origins the application answers as its own, and how a request for a page is told apart from a request for data. The certificate and the single exposed port belong to the deployment spec. Who a request is served as belongs to the accounts and access spec.

## Requirements

### Requirement: The browser is told what the application may do, on every response

Every response MUST carry a content policy, and the policy MUST be the same whether the response is the application itself or an answer from its interface. A policy carried by only one of the two protects only one of them, and an analyst meets both.

The policy MUST permit code only from the install itself. It MUST NOT permit code built from text at run time, and it MUST NOT name a third party as a source of anything, because Article V means there is no third party to name.

Where the application needs the browser to reach somewhere that is not the install, the policy MUST name that destination exactly. It MUST NOT be widened to a pattern, and every destination it names MUST be one the operator has chosen to point the install at.

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

### Requirement: The application refuses to be framed

The application MUST refuse to be embedded in another page. An analyst who cannot see which application they are typing into cannot tell a real refusal from a drawn one, and the case data on the screen belongs to somebody else's customer.

#### Scenario: A page tries to embed the application

- GIVEN a page on another site
- WHEN it tries to embed this install
- THEN the browser refuses to draw it

### Requirement: Case data is not left on the analyst's disk

An answer from the interface MUST NOT be stored by the browser. An analyst reaching a case from a shared machine leaves nothing behind, and a colleague pressing the back button after they sign out sees nothing.

Where the application serves something that is not case data and does not change — an image an analyst chose to represent themselves, the application's own assets — it MAY ask the browser to keep it, and that decision MUST be the route's rather than the default.

#### Scenario: An analyst reads a case and signs out

- GIVEN an analyst who has read a case
- WHEN they sign out and the browser is asked to show the previous page
- THEN the case data is not served from what the browser kept

#### Scenario: An unchanging asset is served

- GIVEN a route serving something that does not change and is not case data
- WHEN it asks the browser to keep it
- THEN the browser is allowed to

### Requirement: An install reached at its own name tells the browser to keep it protected

Where an install is reached at a name of its own, it MUST tell the browser to refuse the unprotected spelling of that name from then on. An analyst who types the address without the scheme, or follows an old link, MUST NOT be able to reach the install unprotected.

An install reached at a loopback address MUST NOT say this. A loopback address is every application on that machine rather than this one, so the instruction would reach far beyond the install giving it and cannot be withdrawn by the install that gave it.

The instruction MUST NOT be extended to names below the one the install is reached at, because those are not the install's to speak for.

#### Scenario: An install reached at its own name

- GIVEN an install reached over a protected connection at a name of its own
- WHEN a browser reads a response
- THEN it is told to refuse the unprotected spelling of that name

#### Scenario: An analyst follows an unprotected link afterwards

- GIVEN a browser that has been told
- WHEN the analyst follows an unprotected link to the install
- THEN the browser does not make the request unprotected

#### Scenario: An install reached at a loopback address

- GIVEN an install reached at a loopback address
- WHEN a browser reads a response
- THEN it is not told to refuse anything at that address

### Requirement: The application answers only to itself

The application MUST decide which origins are its own, and MUST treat a request presented as coming from anywhere else as coming from somewhere else. The set MUST be derived from where the install is actually reached rather than configured separately, so it cannot drift from reality.

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

### Requirement: A development convenience cannot exist in a running install

Where the application accepts an origin that exists only to make development possible, that origin MUST be accepted only when the install is running as a development install, and only when the operator has named it.

An install that is not running as a development install MUST accept no such origin, whatever is configured. An unnamed development port MUST add nothing rather than fall back to a default, because a default is an origin nobody chose and nobody will remember to remove.

#### Scenario: A running install

- GIVEN an install not running in development
- WHEN the trusted set is read
- THEN it holds no development origin

#### Scenario: A development install with no port named

- GIVEN a development install where no development port has been named
- WHEN the trusted set is read
- THEN no development origin was added

### Requirement: A request for data is never answered with a page

The application serves both a page an analyst navigates and an interface a program calls. A request for the interface MUST NOT be answered with the page, whether or not the route exists.

A caller asking for something the interface does not have MUST be told it does not exist, in the form the interface answers in. Answering with the page instead gives a program a document to parse where it expected an answer, and the failure surfaces far from its cause.

Any path the application navigates that is not the interface MUST be answered with the page, so that reloading the browser on a case does not lose it.

#### Scenario: A caller asks for a route the interface does not have

- GIVEN a request for a path under the interface that no route serves
- WHEN it is answered
- THEN the answer says the route does not exist
- AND it is not the application's page

#### Scenario: An analyst reloads on a case

- GIVEN an analyst reading a case at its own address
- WHEN they reload the browser
- THEN the application's page is served
- AND the case opens where they were
