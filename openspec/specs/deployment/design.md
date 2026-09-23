# Scope

**Exactly one component is reachable from outside.** The application, the store, the ephemeral store and everything that prepares an install are reachable only by the parts that need them.

**There is no unprotected way in, and no setting that makes one.** No flag, no environment variable, no test path. The rule is that there is *one* way in rather than that it is protected: a second is a second thing to be correct about, and the one that is off by default is the one nobody checks.

**The operator prepares nothing.** No database created by hand, no certificate generated, no secret set, no schema applied, no documentation read to reach a working install.

**Confinement is where the entry is published, not where a component binds.** A component binding narrowly inside its own network breaks the install without hardening it, because what confines the install is the address its one door is published on.

**A networked install is reached directly at the port its host publishes, on a network the operator trusts.** It is not built to face the internet.

**Per-caller controls hold only where the host hands the edge each caller's own address.** A Linux Docker Engine publishing on a LAN address does. A desktop VM's port forwarder presents every caller as one address, and a proxy in front of the edge, or analysts behind one NAT, are one caller. The containment also assumes an engine that refuses routed access to unpublished ports and confines a loopback publish, which is Docker Engine 28 or later.

**One install serves one name.** A second name is a list the day an operator asks for one.

# Design

## One command, and everything absent is created

An install starts from nothing with a single command. Anything it needs that does not exist yet — the store's shape, the identities it uses, its own certificate, its own identity — is created on first start.

## Preparation is separate from running, and repeatable

Work that prepares an install is done by something other than the application: creating the identities, applying the shape of the store, putting demonstration content in. Each is a distinct step and each is safe to run again, so an install started twice does not prepare twice.

Seeding demonstration content is its own step, so neither of the other two carries the power to do it.

## The operator names the install, and everything follows

Two values, because where the host listens and what analysts type are different facts: a name resolves to an address the host may hold on one interface of several. Each alone fails closed. A name without a listen address is unreachable from elsewhere; a listen address without a name answers only the loopback names, which no browser elsewhere sends.

The edge serves the name alone. The certificate, the name served, the base URL the application derives its origins from, the socket's origins and HSTS all follow from it, so none can be configured to disagree with another. The name is checked before anything is written, because it is written into the edge's own configuration.

## The certificate follows the name, and a supplied one never does

The install records the fingerprint of the certificate it makes. A certificate carrying that fingerprint is the install's own: given a name it does not cover, it is made again, and the operator is told the fingerprint changed. Anything else is the operator's, is validated as before, and is never replaced, a stale record beside it included. A supplied pair is read whoever copied it in.

A rename changes the host, so no browser holds HSTS for the new name: a browser records a host only over a connection it trusted. What traps an analyst is the same name with a new certificate after they trusted the old one, which only losing the certificate store produces, so it is backed up with the credentials.

## An address is believed only from the edge

The address a request is attributed to, for both limiters, the audit and the session, is resolved once and by one rule. The chain of addresses the edge forwards is believed only when the peer that handed it over is the edge; any other peer is attributed to itself, whatever it presents. The edge is named by host and looked up at start. A request from a peer that is not the edge and was not checked in the last few seconds waits for the edge to be looked up again before it is attributed, so an edge started or recreated after the application is recognised on its first request, and one direct caller costs one lookup every few seconds.

The socket upgrade, which no middleware reaches, applies the same rule at its own door.

## A request another site sent is refused at the edge

A request is another site's when its `Origin` is not the host it reached, or when the browser's fetch metadata says it came from elsewhere for anything but a top-level navigation. Both accounts are read, because an image carries no `Origin` and a browser without fetch metadata sends only the `Origin`. Either refuses the request at the edge, on every route, before any limit counts it. A top-level navigation from another site is a link the analyst followed, and opens the install.

A request carrying neither is a program's, and is untouched: it has no browser for another page to steer.

## Least privilege, per part

Each part runs with the least it can: no capability it does not use, no identity broader than its work, no reach it does not need.

The application does not run as the identity that owns anything it uses. It cannot change the shape of the store and cannot alter the rules that decide what it may read — which is what makes those rules a boundary rather than a convention the application is trusted to observe.

## What survives, and what must not

Named as surviving being stopped, rebuilt and upgraded: the store's data, the certificate, the install's own identity, and evidence.

Nothing else. Anything held elsewhere is reconstructible, and the install can be destroyed and recreated without losing any of the four.

## Well is not the same as started

An install reports whether it is serving, and distinguishes *started* from *serving*: a component that has begun and cannot yet answer is not ready, and treating it as ready is how a broken install looks healthy.

Where a part is unwell, what is wrong is nameable without reading a log — which store, which dependency, which piece of preparation.

## The install says which mode it is, and is refused if it does not

An install declares whether it is running in production. Nothing infers it, and there is no default, because a security decision reads that declaration and a default is a choice made for the operator.

Running in production is what withholds the trusted-origin grant to the development server's port, which is applied as cross-origin access with credentials. Whether a forwarded address is believed is never read from the mode: it is a statement about who connected, not about how the application was built.

An install that declares no mode is refused at startup, naming what it must declare, rather than being given whichever answer happened to be the default.

Every intended way to start the application declares it, which is what makes refusal the right answer rather than an obstacle: the development script, the shipped image and the test harness each say which mode they are.
