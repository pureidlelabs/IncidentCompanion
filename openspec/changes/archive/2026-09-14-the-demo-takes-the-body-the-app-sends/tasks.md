# Tasks

## 1. The body the app sends

- [x] 1.1 Separate what rides with a patch from what is in it, as the route does
- [x] 1.2 Check the version rather than judge it as a field, and advance it on a write
- [x] 1.3 Make the fixture send what the client sends, encoding included

## 2. The install's own rules

- [x] 2.1 Judge a case write by the install's schema rather than a list of field names
- [x] 2.2 Keep one definition of that schema, read by the route and by the build
- [x] 2.3 Refuse a patch that changes nothing, on both routes

## 3. The same refusal

- [x] 3.1 Answer a conflict in the words the route answers in, carrying the version it holds
- [x] 3.2 Name the field, so a refusal draws the per-field card rather than a toast

## 4. Left open

- [ ] 4.1 `DELETE` ignores the version entirely, where the route refuses a non-integer and a stale one
- [ ] 4.2 Nothing drives the real `request()` through the demo transport, so parity is asserted per route rather than per client call
