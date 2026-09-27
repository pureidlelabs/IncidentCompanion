# Deployment

## MODIFIED Requirements

### Requirement: The connection is protected, and there is no way to turn that off

Everything reaching the install MUST arrive over a protected connection. There MUST be no setting, flag, environment variable or test path that serves it unprotected.

The rule is that there is **one** way in rather than that it is protected specifically: a second way is a second thing to be correct about, and the one that is off by default is the one nobody checks.

**Every protocol version and cipher suite the install agrees MUST give forward secrecy and authenticated encryption**, and a client offering nothing else MUST be refused rather than served. A connection recorded today and read the day its key leaks was never protected.

An install with no certificate MUST make one rather than serve without, so that a first start needs nothing prepared. A certificate the install makes MUST cover the name it is reached at. Where that name changes, a certificate the install made MUST be made again for the new name, and the operator MUST be told its fingerprint changed.

**A certificate the operator supplies MUST be used, and MUST NOT be replaced.** An install generating its own on every start would make it impossible to serve one an organisation's own authority issued, which is the only way an install exposed beyond its own machine is trusted by the browsers reaching it. A generated certificate is the fallback for an install nobody has given one to, never the only option.

Where a supplied certificate cannot be used — malformed, expired, not matching what the install is reached at — the install MUST say which and MUST NOT quietly generate one in its place. Silently substituting a self-signed certificate for the operator's is how an install that appears trusted stops being.

#### Scenario: An install has no certificate

- GIVEN a first start with no certificate
- WHEN the install comes up
- THEN it has made one
- AND it is serving protected

#### Scenario: A client offers only a weaker protection

- GIVEN a client offering only suites without forward secrecy or without authenticated encryption
- WHEN it connects to the install
- THEN the install refuses the connection
- AND a client offering a suite with both is served

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

#### Scenario: The install is given a new name

- GIVEN an install serving a certificate it made
- WHEN the operator gives it a name that certificate does not cover
- THEN the install makes one for the new name
- AND the operator is told the fingerprint changed

#### Scenario: A supplied certificate does not cover a new name

- GIVEN an install serving a certificate the operator supplied
- WHEN the operator gives it a name that certificate does not cover
- THEN the install says the certificate does not cover it
- AND does not make one in its place
