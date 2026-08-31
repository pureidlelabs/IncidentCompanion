# Security

## Status

**IncidentCompanion is in early development. Nothing here is ready for real casework, and no version of it is intended to face the internet.**

The Compose stack is a local deployment. It has no hardened configuration, no upgrade path, and no release. If you are running it, you are running it to look at it.

## Supported versions

None yet. There are no releases, so there is nothing to backport a fix to. Fixes land on `main` and that is the only place they exist.

## Reporting a vulnerability

Use [private vulnerability reporting](https://github.com/pureidlelabs/IncidentCompanion/security/advisories/new) on this repository. It opens a private thread with the maintainer and stays private until there is something to publish.

Please do not open a public issue for a vulnerability that is exploitable against a running deployment. Everything else — a hardening gap, a missing control, a design concern — is welcome as an ordinary public issue.

There is no bounty and no service-level agreement. There is one maintainer, so expect a reply in days rather than hours.

## Known gaps are public

The controls this application does not yet implement are tracked as open issues, labelled `security`, and readable by anyone. That is deliberate.

Grounding the work in [OWASP ASVS 5.0 Level 2](https://owasp.org/www-project-application-security-verification-standard/) only means something if the score is honest, and a gap nobody has written down is one nobody is obliged to close. So the list of what is missing is part of the record rather than a thing to be discovered.

That is a defensible position precisely because there are no deployments to attack. It changes the day a release exists: from then on, a defect that is exploitable against software people run belongs in a draft advisory, not an issue.

## What this application is for

It holds the findings of a security investigation: hostnames, accounts, indicators, evidence files and the analyst's own notes. That is sensitive material about a real intrusion, and the threat model is a matter of where you put it, not only of what the code does.

Run it where the data it holds is already allowed to be.
