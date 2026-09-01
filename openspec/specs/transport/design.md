# Scope

**One policy, on everything.** The page and the interface carry the same content policy. Two policies would mean two things to keep true, and the one that lapses is the one nobody looks at.

**An install speaks for its own name and for nothing else.** Reached at a name of its own, it tells the browser to keep the connection protected. Reached at a loopback address, it says nothing: loopback is every application on that machine, the instruction would reach all of them, and the install that gave it cannot take it back. Nothing is ever said about names below the install's own. The deviation for the self-signed certificate is in the constitution's register.

**The trusted origin set is CSRF defence, not a CORS policy.** It answers which origins the application treats as its own for a state-changing request. It is not a grant to a third-party front end, and there is none.

**A development origin exists and cannot survive into production.** It is gated on the run mode and on the operator naming a port, with no default.

# Design

## The policy names destinations, never patterns

Code comes from the install and nowhere else, and cannot be built from text at run time. There is no content delivery network to permit, because Article V means nothing is fetched from one.

Where the browser must reach outside the install — the operator's own identity provider, the platform an incident is imported from — the destination is named exactly. A pattern would admit every host under a suffix, and the value of the policy is entirely in what it excludes.

**Embedding is refused outright.** An analyst who cannot see which application they are typing into cannot tell a real refusal from a drawn one.

**One embedding exception exists, and it is for the application's own generated document.** A report preview is drawn from bytes the install produced in the browser's own memory. It is narrower than permitting a source, because there is no source to permit.

## Nothing from the interface is kept by the browser

Every answer under the interface is marked not to be stored. An analyst on a shared machine leaves nothing, and the back button after a sign-out serves nothing.

**A route may override this, and only a route.** The default is not-stored and the exception is stated at the route that wants it — an image representing an analyst, which is not case data and does not change. Making it the other way round means every new route is a decision somebody has to remember to take.

## The trusted set is derived from where the install actually is

It comes from the address the install is reached at rather than from its own configuration key, so it cannot drift from reality.

**Loopback is spelled three ways** and a browser and an operator will not agree on which. All three are accepted at the same scheme and port.

**Neither scheme nor port is ever widened.** The unprotected spelling of a protected install is a different origin, and so is another port on the same host.

**An address that cannot be parsed yields nothing.** Failing to an empty set means the install refuses its own requests and somebody notices. Failing open means it accepts everybody's and nobody does.

## The page is served last, and never under the interface

Any path that is not the interface is answered with the application's page, so reloading the browser on a case does not lose it.

**A path under the interface is never answered with the page, whether or not a route serves it.** A caller expecting an answer and receiving a document parses a document, and the failure surfaces a long way from its cause. A route that does not exist says so in the form the interface answers in.
