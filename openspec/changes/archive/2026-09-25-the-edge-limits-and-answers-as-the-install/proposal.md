# The edge limits and answers as the install

## Why

The edge in front of the application writes some answers itself and limits what reaches it, and four of those behaviours fell short of what the install owes. The session read that reports an analyst at the keyboard spent the sign-in limit, so colleagues at one address starved each other's sign-in and a guesser starved their activity reports (#1246). TLS 1.2 still agreed suites with no forward secrecy and CBC suites with SHA-1 MACs, and the ASVS matrix traced neither V12.1.1 nor V12.1.2 (#1249). A backup wrote the database and every artefact readable by every account on the host (#1251). The edge's own refusals and error pages carried no content policy and no nosniff, and every answer named the edge's exact build (#1208).

## What Changes

- **accounts-and-access**: reporting that a session is in use is not a credential attempt, so it neither spends nor is starved by the sign-in limit of its address.
- **deployment**: every protocol and suite the install agrees gives forward secrecy and authenticated encryption, and a client offering nothing else is refused.
- **state**: a copy of the install's state is readable only by whoever took it.
- **transport**: an answer the install gives without the application carries a policy that permits nothing and nosniff, and no answer names what software version wrote it.

## Impact

- The edge gives the session read the application's general budget rather than the credential one.
- The edge's TLS configuration follows Mozilla's intermediate profile, guidelines 6.0.
- The backup command writes under an owner-only umask.
- The edge adds a policy and nosniff to any answer the application did not put them on, and stops naming its version.
