# Deployment

## Purpose

How this application arrives on a machine and runs there. It is installed by somebody defending their own network, frequently one who did not build it and will not read its source, so what it asks of them and what it does on its own are both part of the product.

## Requirements

### Requirement: It comes up with one command and no preparation

An install MUST start from nothing with a single command, and MUST NOT require the operator to create a database, generate a certificate, set a secret, run a schema, or read documentation to get a working application.

Everything the application needs that does not exist yet MUST be created on first start.

An operator MUST NOT need to know the order things start in. A component that is not ready yet MUST be waited for, not raced.

#### Scenario: A first start on a clean machine

- GIVEN a machine with nothing of this application on it
- WHEN the operator runs the one command
- THEN the application is serving
- AND nothing was configured by hand first

#### Scenario: A second start

- GIVEN an install that has run before
- WHEN it is started again
- THEN nothing that already exists is recreated
- AND no data is lost

#### Scenario: A dependency is slow

- GIVEN a component that takes longer than usual to become ready
- WHEN the application starts
- THEN it waits rather than failing
- AND nothing that depends on it runs before it is ready

### Requirement: There is one way in, and it is the only thing exposed

Exactly one component MUST be reachable from outside the install. Every other part MUST be reachable only by the parts that need it.

The application itself MUST NOT be reachable directly. Neither MUST the store, the ephemeral store, or anything that runs to set the install up.

**Exposure MUST be decided by what is published, not by what a component listens on.** A component narrowing what it listens on inside its own boundary does not decide who can reach it, because the layer that publishes it sits in front of that decision — and on most systems it also sits in front of the operator's firewall.

An install MUST default to being reachable only from the machine it runs on. Making it reachable from elsewhere MUST be a deliberate act by the operator.

#### Scenario: What an install exposes

- GIVEN a running install
- WHEN what is reachable from outside it is enumerated
- THEN exactly one thing is

#### Scenario: The application is addressed directly

- GIVEN a running install
- WHEN something attempts to reach the application without going through the one way in
- THEN it cannot

#### Scenario: An operator wants it reachable from the network

- GIVEN a default install, reachable only from its own machine
- WHEN the operator wants it reachable from elsewhere
- THEN that is a change they make deliberately

### Requirement: The connection is protected, and there is no way to turn that off

Everything reaching the install MUST arrive over a protected connection. There MUST be no setting, flag, environment variable or test path that serves it unprotected.

The rule is that there is **one** way in rather than that it is protected specifically: a second way is a second thing to be correct about, and the one that is off by default is the one nobody checks.

An install with no certificate MUST make one rather than serve without, so that a first start needs nothing prepared.

**A certificate the operator supplies MUST be used, and MUST NOT be replaced.** An install generating its own on every start would make it impossible to serve one an organisation's own authority issued, which is the only way an install exposed beyond its own machine is trusted by the browsers reaching it. A generated certificate is the fallback for an install nobody has given one to, never the only option.

Where a supplied certificate cannot be used — malformed, expired, not matching what the install is reached at — the install MUST say which and MUST NOT quietly generate one in its place. Silently substituting a self-signed certificate for the operator's is how an install that appears trusted stops being.

#### Scenario: An install has no certificate

- GIVEN a first start with no certificate
- WHEN the install comes up
- THEN it has made one
- AND it is serving protected

#### Scenario: The operator supplies a certificate

- GIVEN an operator with a certificate from an authority their organisation trusts
- WHEN they supply it to the install
- THEN the install serves it
- AND does not replace it on the next start

#### Scenario: A supplied certificate cannot be used

- GIVEN a supplied certificate that is malformed or does not match
- WHEN the install starts
- THEN it says which
- AND does not silently serve a generated one in its place

#### Scenario: Somebody wants it unprotected

- GIVEN an operator or a test wanting a plain connection
- WHEN they look for a way
- THEN there is none

### Requirement: Setting up is separate from running, and runs once

Work that prepares an install — creating the identities the application uses, applying the shape of the store, putting demonstration content in — MUST be done by something other than the application, and MUST complete before the application starts.

Each MUST be safe to run again. An install that is started twice MUST NOT do its preparation twice.

The application MUST NOT hold the ability to do any of it. Preparation and serving are different powers, and combining them means the running application can change the shape of its own store.

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

### Requirement: What must survive is named, and what must not is not

Everything that must outlive the install's own lifetime MUST be held where it survives being stopped, rebuilt and upgraded: the store's data, the certificate, the install's own identity, and evidence.

Nothing else MUST be. Anything held elsewhere MUST be reconstructible, and the install MUST be able to be destroyed and recreated without losing the store, the certificate, the identity or the evidence.

#### Scenario: The install is rebuilt

- GIVEN a running install with cases in it
- WHEN it is destroyed and recreated
- THEN every case, its evidence and the install's identity are as they were
- AND the certificate is the one it had

#### Scenario: Something not named is lost

- GIVEN a running install
- WHEN anything outside what must survive is lost
- THEN the install rebuilds it
- AND nobody notices beyond signing in again

### Requirement: An install can say whether it is well, and what is wrong

An install MUST be able to report whether it is serving, and MUST distinguish *started* from *serving*: a component that has begun and cannot yet answer is not ready, and treating it as ready is how a start reports success onto a broken install.

Where a part is unwell, what is wrong MUST be nameable without reading a log — which store, which dependency, which piece of preparation.

An install MUST NOT report itself well while a component it needs is not.

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

### Requirement: The application runs with no more than it needs

Each part MUST run with the least it can: no capability it does not use, no identity broader than its work, no reach it does not need.

The application MUST NOT run as the identity that owns anything it uses. It MUST NOT be able to change the shape of the store, and MUST NOT be able to alter the rules that decide what it may read.

#### Scenario: The application attempts something outside its work

- GIVEN the running application
- WHEN it attempts to change the shape of the store or the rules that scope it
- THEN it is refused by the store rather than by its own restraint

#### Scenario: A part is examined for what it can do

- GIVEN any part of the install
- WHEN what it is permitted to do is enumerated
- THEN nothing in it is unused
