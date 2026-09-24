# Security

## Status

**IncidentCompanion is in early development. Nothing here is ready for real casework, and no version of it is intended to face the internet.**

The Compose stack runs on one machine and is reached over a network you trust: the machine itself, or a LAN whose other machines are your analysts'. It has no hardened configuration, no upgrade path, and no release. If you are running it, you are running it to look at it.

## Where it may run

- **A network you trust, never the internet.** Analysts reach one install from their own machines; nothing about it is built to face strangers.
- **A Linux host running Docker Engine 28 or later.** Per-analyst limits and the address recorded against each request depend on the host passing every caller's own address through, and on the engine refusing access to ports that were never published. A desktop VM presents the whole network as one caller.
- **One configuration step.** The operator names the install and the address it listens on in `.env`; the [README](README.md#reaching-it-from-other-machines) says how.
- **A certificate the analysts have checked.** Either one from an authority their machines already trust, or the one the install makes, whose fingerprint the operator gives each analyst out of band to compare before trusting it. Until they have, the browser's instruction to keep the name protected does not take effect.

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
