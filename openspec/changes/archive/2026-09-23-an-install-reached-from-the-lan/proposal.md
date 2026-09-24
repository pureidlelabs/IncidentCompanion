# An install reached from the LAN

## Why

v0.1 is deployed networked on a trusted LAN: analysts on their own machines reach one install. The specifications allowed that as *a deliberate act by the operator* and said nothing about what the act was, and the shipped stack had none. Reaching the install from another machine took five hand edits, two of them to tracked files and one an image rebuild, and there was no path to a certificate for a name. Once made by hand, three things were still wrong that no edit fixed: the application stated HSTS from its configuration, at `localhost` too; the socket admitted the unprotected spelling of the install that sign-in refuses; and any container on the compose network could present an address of its choosing to the audit and the limiters.

Where the requirements were silent, the code was free to be wrong: nothing said which origins a socket must admit, that a caller's limit is its own, or that a page on another site cannot spend it.

## What Changes

- Making the install reachable from elsewhere is one act, naming it and where it listens, and everything that depends on where it is reached follows from that act. A named install answers at that name and at nothing else.
- A certificate the install makes covers the name it is reached at, and is made again when the name changes; one the operator supplied never is.
- The content policy names no destination outside the install unless the operator pointed it there, and no source matching any host, a scheme on its own included.
- An ordinary request and a socket are admitted by the same set of origins.
- A caller's limit is its own: another caller, or a page on another site sending requests through the analyst's browser, does not spend it.
- A caller that reaches the application without passing the one way in is recorded at its own address.
- The deployment design records where per-caller controls hold and where they do not, and that a networked install runs on a Linux Docker Engine 28 or later.

## Impact

- `openspec/specs/deployment/spec.md`, `transport/spec.md`, `the-api/spec.md`, `install-audit/spec.md`: requirements modified, scenarios added.
- `openspec/specs/deployment/design.md` and `transport/design.md`: the operator's act, the certificate, attribution, and HSTS as the edge's alone.
- `openspec/constitution.md`: the V12.2.2 row's reason.
- `compose.yaml`, `docker/nginx/`, `server/src/wire/`, `server/src/live/`, `server/src/incident-import/`, `ui/src/app/`; `README.md` and `SECURITY.md`.
