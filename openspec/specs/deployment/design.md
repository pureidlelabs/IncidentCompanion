# Scope

**Exactly one component is reachable from outside.** The application, the store, the ephemeral store and everything that prepares an install are reachable only by the parts that need them.

**There is no unprotected way in, and no setting that makes one.** No flag, no environment variable, no test path. The rule is that there is *one* way in rather than that it is protected: a second is a second thing to be correct about, and the one that is off by default is the one nobody checks.

**The operator prepares nothing.** No database created by hand, no certificate generated, no secret set, no schema applied, no documentation read to reach a working install.

**Confinement is where the entry is published, not where a component binds.** A component binding narrowly inside its own network breaks the install without hardening it, because what confines the install is the address its one door is published on.

# Design

## One command, and everything absent is created

An install starts from nothing with a single command. Anything it needs that does not exist yet — the store's shape, the identities it uses, its own certificate, its own identity — is created on first start.

## Preparation is separate from running, and repeatable

Work that prepares an install is done by something other than the application: creating the identities, applying the shape of the store, putting demonstration content in. Each is a distinct step and each is safe to run again, so an install started twice does not prepare twice.

Seeding demonstration content is its own step, so neither of the other two carries the power to do it.

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

An install declares whether it is running in production. Nothing infers it, and there is no default, because more than one security decision reads that declaration and the safe answer is a different value for each of them.

Running in production is what makes a client-IP header believable: the edge overwrites that header on every request, so the value cannot be the caller's, and the app publishes no port of its own. Outside production there is no edge to have overwritten it, so the same header is whatever the caller typed and no header may be believed.

Running in production is also what withholds the trusted-origin grant to the development server's port, which is applied as cross-origin access with credentials.

So a single default would close one of those and open the other. An install that declares no mode is refused at startup, naming what it must declare, rather than being given whichever answer happened to be the default.

Every intended way to start the application declares it, which is what makes refusal the right answer rather than an obstacle: the development script, the shipped image and the test harness each say which mode they are.
