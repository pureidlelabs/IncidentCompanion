# Scope

**A networked install is reached directly at the port its host publishes, on a network the operator trusts.** It is not built to face the internet. Folded into `deployment/design.md`, with the rest of the deployment half below; the transport half is folded into `transport/design.md`.

**Per-caller controls hold only where the host hands the edge each caller's own address.** A Linux Docker Engine publishing on a LAN address does. A desktop VM's port forwarder presents every caller as one address, and a proxy in front of the edge, or analysts behind one NAT, are one caller. The containment also assumes an engine that refuses routed access to unpublished ports and confines a loopback publish, which is Docker Engine 28 or later.

**One install serves one name.** A second name is a list the day an operator asks for one.

# Design

## Deployment: the operator names the install, and everything follows

Two values, because where the host listens and what analysts type are different facts: a name resolves to an address the host may hold on one interface of several. Each alone fails closed. A name without a listen address is unreachable from elsewhere; a listen address without a name answers only the loopback names, which no browser elsewhere sends.

The edge serves the name alone. The certificate, the name served, the base URL the application derives its origins from, the socket's origins and HSTS all follow from it, so none can be configured to disagree with another. The name is checked before anything is written, because it is written into the edge's own configuration.

## Deployment: the certificate follows the name, and a supplied one never does

The install records the fingerprint of the certificate it makes. A certificate carrying that fingerprint is the install's own: given a name it does not cover, it is made again, and the operator is told the fingerprint changed. Anything else is the operator's, is validated as before, and is never replaced, a stale record beside it included.

A rename changes the host, so no browser holds HSTS for the new name: a browser records a host only over a connection it trusted. What traps an analyst is the same name with a new certificate after they trusted the old one, which only losing the certificate store produces, so it is backed up with the credentials.

## Deployment: an address is believed only from the edge

The address a request is attributed to, for both limiters, the audit and the session, is resolved once and by one rule. The chain of addresses the edge forwards is believed only when the peer that handed it over is the edge; any other peer is attributed to itself, whatever it presents. The edge is named by host and looked up at start and again on a miss, at most every few seconds, so a recreated edge is found and a flood of direct callers costs little. Until it is found, a request is attributed to its own peer.

The socket upgrade, which no middleware reaches, applies the same rule at its own door.

Believing a forwarded address is a statement about who connected, never about how the application was built.

## Deployment: a cross-site credential request is refused at the edge

A request to the credential paths presenting another site's origin is refused at the edge before either limiter counts it. A request with no origin is untouched, because a program calling the install sends none and has no browser to be steered by another page.

## Transport: HSTS is the edge's alone

The edge answers it, from the host a request arrived at. The application never holds the protected connection and states nothing about it, so a named install is told once and a loopback response reached through the same application is told nothing.

## Transport: a socket is admitted by the trusted set

A socket's handshake is admitted when its origin is one of the install's own origins, the set the credential routes enforce. It is never compared with the host it was forwarded, which carries whatever the browser sent.

## Transport: the policy names the install's own socket and what the operator turned on

The case socket is named at each of the install's own origins, derived from the trusted set, because not every browser admits a socket under the policy's own-origin keyword. An address with no spelling in the policy's grammar is left out. An import platform's destinations are named only where the operator turned importing from it on, and the client offers the importer on the same condition.
