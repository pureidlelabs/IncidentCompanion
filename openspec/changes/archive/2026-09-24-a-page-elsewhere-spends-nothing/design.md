# Scope

**Another site is recognised by what the browser says, not by what a program omits.** A request carrying neither an `Origin` nor fetch metadata is a program's, and is untouched: it has no browser for another page to steer.

# Design

## Deployment: a request another site sent is refused at the edge

A request is another site's when its `Origin` is not the host it reached, or when the browser's fetch metadata says it came from elsewhere for anything but a top-level navigation. Both accounts are read, because an image carries no `Origin` and a browser without fetch metadata sends only the `Origin`. Either refuses the request at the edge, on every route, before any limit counts it. A top-level navigation from another site is a link the analyst followed, and opens the install.

## Deployment: an unfamiliar peer waits for the edge to be looked up

A request from a peer that is not the edge and was not checked in the last few seconds waits for the edge to be looked up before it is attributed. An edge that started or was recreated after the application is recognised on its first request, and one direct caller costs one lookup every few seconds.
