# Scope

**The edge's own answers carry a policy of their own.** The application's policy depends on where the install is reached and what the operator turned on, and the edge knows neither, so an answer it writes carries one that permits nothing rather than a copy that could drift from the application's.

**The order among the suites left is the client's.** Every suite the install agrees is forward-secret and authenticated, which is how Mozilla's intermediate profile reads *the strongest set as preferred*, and it leaves the choice among them to the client.

# Design

## The session read spends the analyst's budget, not the guesser's

The edge limits requests per address in two budgets: a tight one for the credential paths, where somebody guessing spends requests, and a wide one for everything an analyst does. The session read that reports an analyst at the keyboard takes the wide one. The client sends it on real input and at most once a minute per tab, plus once per page load, so behind one address it is sized like the rest of an analyst's traffic rather than like a guess.

A request the credential budget refuses spends nothing of the wide one, so a burst of guesses from an address does not starve the reports of the analysts there. Every other path under the authentication library's mount stays in the tight budget, so a door added there later is limited as a credential path until somebody decides otherwise.

## The connection follows Mozilla's intermediate profile

TLS 1.2 and 1.3 only. Under TLS 1.2, ECDHE key exchange with AES-GCM or ChaCha20-Poly1305 and nothing else; under TLS 1.3, the protocol's own suites, all of which qualify. The profile is set once, for every name the edge serves, because the handshake is settled before the requested name picks a server. → <https://ssl-config.mozilla.org/guidelines/6.0.json>

## A copy is written owner-only

Taking a copy writes under an owner-only file-creation mask, so the directory and every part of it are the operator's alone from the moment each exists, and a directory it creates on the way is too.

## What the edge adds, and what it leaves alone

The edge adds its policy and nosniff to an answer only where the application sent none, so a response the application wrote reaches the browser with the application's own headers and no second policy beside them: two policies would both be enforced, and the edge's permits nothing. An answer the edge writes itself — a refusal, an unreadable request, the application unreachable — has neither and gets both. The edge names itself without a version, in the header and in the pages it writes.
