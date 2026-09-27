# Scope

**One policy, on everything.** The page and the interface carry the same content policy. Two policies would mean two things to keep true, and the one that lapses is the one nobody looks at.

**The edge's own answers carry a policy of their own.** The application's policy depends on where the install is reached and what the operator turned on, and the edge knows neither, so an answer it writes carries one that permits nothing rather than a copy that could drift from the application's.

**Two layers answer this specification, and which one answers what is not arbitrary.** The application decides what the browser may do with a response it produced — the content policy, framing, what may be kept, what is a page and what is an answer. The edge decides everything about the connection, because the edge is the only thing that has one: it terminates the protected connection and the application is reached over a plain one behind it.

**So a rule about the connection is never the application's to state.** An application that never speaks the protected protocol asserting a policy about it is asserting something it cannot know, over a connection where the assertion means nothing. A reader who finds that setting switched off in the application and switches it on has moved the rule to the layer that cannot enforce it.

**An install speaks for its own name and for nothing else.** Reached at a name of its own, it tells the browser to keep the connection protected. Reached at a loopback address, it says nothing: loopback is every application on that machine, the instruction would reach all of them, and the install that gave it cannot take it back. Nothing is ever said about names below the install's own. The deviation for the self-signed certificate is in the constitution's register.

**The trusted origin set is CSRF defence, not a CORS policy.** It answers which origins the application treats as its own for a state-changing request. It is not a grant to a third-party front end, and there is none.

**A development origin exists and cannot survive into production.** It is gated on the run mode and on the operator naming a port, with no default.

# Design

## The policy names destinations, never patterns

Code comes from the install and nowhere else, and cannot be built from text at run time. There is no content delivery network to permit, because Article V means nothing is fetched from one.

Where the browser must reach outside the install — the operator's own identity provider, the platform an incident is imported from — the destination is named exactly. A pattern would admit every host under a suffix, and the value of the policy is entirely in what it excludes.

**A scheme on its own is a pattern.** The case socket is named at each of the install's own origins, derived from the trusted set, because not every browser admits a socket under the policy's own-origin keyword. An address with no spelling in the policy's grammar is left out. An import platform's destinations are named only where the operator turned importing from it on, and the client offers the importer on the same condition.

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

**A socket is admitted by the same set.** Its handshake is compared with the install's own origins, the set the credential routes enforce, and never with the host it was forwarded, which carries whatever the browser sent.

## Refusing the unprotected spelling is conditional on where the install is

An install reached at a name of its own tells the browser to refuse the unprotected spelling of that name. One reached at a loopback address does not: a loopback address is every application on that machine rather than this one, so the instruction reaches far past the install giving it and cannot be withdrawn by it.

The edge answers it, from the host a request arrived at. The application never holds the protected connection and states nothing about it, so a named install is told once, and a loopback response reached through the same application is told nothing.

**The instruction is never extended below the name it was given at, and never submitted to a browser's preload list.** The first would speak for names the install does not serve; the second is a list no install can withdraw itself from, which makes a reversible decision permanent.

The boundary: an install reached over plain http is told nothing, because a browser is required to ignore this instruction when it does not arrive protected.

## The page is served last, and never under the interface

Any path that is not the interface is answered with the application's page, so reloading the browser on a case does not lose it.

**A path under the interface is never answered with the page, whether or not a route serves it.** A caller expecting an answer and receiving a document parses a document, and the failure surfaces a long way from its cause. A route that does not exist says so in the form the interface answers in.

## What the edge adds, and what it leaves alone

The edge adds its policy and nosniff to an answer only where the application sent none, so a response the application wrote reaches the browser with the application's own headers and no second policy beside them: two policies would both be enforced, and the edge's permits nothing. An answer the edge writes itself — a refusal, an unreadable request, the application unreachable — has neither and gets both. The edge names itself without a version, in the header and in the pages it writes. It gives up connecting to the application after a few seconds, since the two share a network, so an application that is gone is answered as gone rather than holding the caller.
