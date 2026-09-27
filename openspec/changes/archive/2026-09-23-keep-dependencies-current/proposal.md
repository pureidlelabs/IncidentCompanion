# Keep dependencies current

## Why

The application is self-hosted, so the tree an operator installs is the tree they run: a dependency carrying a known vulnerability reaches their hardware, and no vendor is positioned to patch it for them. Nothing in the specifications says what may be depended on or how current it must be, and the coverage matrix traces no dependency-management control at all, which the constitution treats as a gap to close or a deviation to record rather than a silence.

Currency is also not the same as newest. A registry is a distribution channel an attacker can publish to, and adopting a version the day it appears is how a compromised release reaches an install before anybody has looked at it.

## What Changes

- A new capability states what the application owes about the versions it is built from: that they are current, that a known vulnerability is answered rather than queued, that a version is not adopted before it has been observable long enough for a compromise to surface, and that a dependency deliberately held back says why and what would release it.
- A requirement that nothing reaches the release branch without the full local suite demonstrating it, the stack running. This is already how the project works and is nowhere stated, so it cannot be depended on.
- The coverage matrix gains the OWASP ASVS 5.0 dependency-management controls the new requirements answer, and records as a deviation any it does not.
- **No mechanism is specified.** Which tool discovers a version, where it runs, how a held dependency is tracked and what the release-age floor is in days are implementation, and belong to the design record and the repository rather than to a requirement.

## Capabilities

### New Capabilities

- `dependencies`: What the application owes about the third-party versions it is built from -- currency, response to a known vulnerability, the observation period before automatic adoption, a recorded reason for anything held back, and the demonstration owed before a change to them lands.

### Modified Capabilities

None. The constitution's Article VII already governs licence compatibility of anything added and is unchanged; this capability sits beside it rather than altering it.

## Impact

- `openspec/specs/dependencies/` is new.
- `openspec/matrix/asvs.md` gains the dependency-management controls, which it traces none of.
- Three facts about the tree are already in tension with the requirements and are the first things the capability makes visible rather than new work it creates: `@thallesp/nestjs-better-auth` constrains both TypeScript and NestJS to a major below their latest, so the two lift together; `.npmrc` sets `legacy-peer-deps=true`, so no peer constraint is enforced at install; and the four container base images are named by tag rather than by digest, so a rebuild resolves whatever the tag points at that day.
- No application code changes. The capability describes a property of what is built, not behaviour an analyst invokes.
