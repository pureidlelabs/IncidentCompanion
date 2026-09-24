# Tasks

## 1. The operator's act

- [x] 1.1 Name the install and where it listens in the root `.env`; compose carries both to the edge and the base URL
- [x] 1.2 The edge validates the name, serves it alone, and mints a certificate for it
- [x] 1.3 A certificate the install made is made again for a new name; a supplied one never is
- [x] 1.4 The operator's example moves to the root

## 2. What the application states

- [x] 2.1 HSTS is the edge's alone
- [x] 2.2 The content policy names the install's own socket and, where turned on, the import platform
- [x] 2.3 The client offers the importer only where the operator turned it on
- [x] 2.4 A socket is admitted by the trusted set

## 3. Who a request is from

- [x] 3.1 The door writes the peer onto the forwarded chain, believed only from the edge
- [x] 3.2 Better Auth resolves it under `trustedProxies`, and every reader asks the same rule
- [x] 3.3 The edge refuses a foreign-origin credential request before it counts

## 4. Shown

- [x] 4.1 The shipped stack at a name, reached from analyst containers
- [x] 4.2 README and SECURITY.md say where v0.1 runs and what the operator does
- [x] 4.3 The ledger and the deviation register
