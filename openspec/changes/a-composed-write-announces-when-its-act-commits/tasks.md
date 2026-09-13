# Tasks

## 1. The act owns the announcement

- [x] 1.1 Give an act somewhere to collect what its writes would say, found from anywhere inside it
- [x] 1.2 Say it after the commit that made it true, and not at all where there was none
- [x] 1.3 Take the per-call-site guard out of the write path, so a composed write announces by the same route as any other

## 2. What it must not do

- [x] 2.1 Leave an uncomposed write announcing anything later than it does now
- [x] 2.2 Let the act reach the channel, which would put a layer underneath one above it
- [x] 2.3 Accept a write composed into a transaction nothing declared as an act

## 3. The failure that could not be read

- [x] 3.1 Put a deadline on waiting for a connection, so a pool with none left says so

## 4. Left open

- [ ] 4.1 A check that refuses a service method reaching for the pool while it holds an executor — the hazard is structural and greppable, and `tests/repo` already holds this kind of rule
