<p align="center">
  <img src="assets/logo.png" width="140" alt="IncidentCompanion logo">
</p>

<h1 align="center">IncidentCompanion</h1>

<p align="center">
  A self-hosted workspace for security incident investigation and root-cause analysis.<br>
  <em>Because untangling an intrusion shouldn't mean fighting your own tools.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="AGPL-3.0-only license">
  <img src="https://img.shields.io/badge/status-early%20development-orange.svg" alt="Early development">
  <img src="https://img.shields.io/badge/deploy-docker%20compose-2496ED.svg" alt="Docker Compose">
  <img src="https://img.shields.io/badge/data-self--hosted-brightgreen.svg" alt="Self-hosted">
</p>

---

## What it is

When you investigate a security incident, the findings end up scattered — a timeline in one place, the affected machines in another, screenshots in a folder, and the report written from memory at the end.

IncidentCompanion keeps all of it in one case, and produces the report from it.

- **One case, one workspace.** Timeline, machines, accounts, malware and evidence together.
- **Two analysts, not one.** Edits appear on everyone's screen; a conflicting save asks rather than overwrites.
- **Evidence is hashed as you attach it**, and stays with the case.
- **The report is the point** — a chronology that survives the paste into Word.
- **Self-hosted.** Runs on your machine or your server. Nothing leaves it.

Written for SOC, MXDR and incident-response analysts.

## Before you start

**This is early development. It is not ready for real casework.**

There are no releases and no upgrade path — the case format changes without warning, and older data is rejected rather than converted. Assume anything you put in will need re-entering.

The Compose stack is a local, non-production deployment. Do not put it on a network.

## Quick start

Docker with Compose v2 is the only requirement.

```bash
git clone https://github.com/pureidlelabs/IncidentCompanion.git
cd IncidentCompanion
docker compose up --build
```

Open <https://127.0.0.1>. The first run builds the images and takes a few minutes; after that it starts in seconds.

Two things to expect on that first run:

- **A certificate warning.** It is self-signed. The terminal prints the fingerprint — check it matches, then accept.
- **A setup token** in the same output. Claim the install at `/setup` to create the first account. It is printed once and stored nowhere.

## Inside a case

The app opens on a case picker; a case opens on a rail of sections, one per kind of finding, and the report is built from what you put in them.

**A demo case ships with the app.** Open it from the picker to see a filled-in case without entering anything.

Screenshots wait until the interface settles. Publishing pictures of a layout that changes weekly means publishing pictures that are wrong.

## Contact

Open an [issue](https://github.com/pureidlelabs/IncidentCompanion/issues) — bugs, ideas, or a question about whether it fits what you do.

Feedback from people who write incident reports for a living is the most useful kind, and what it gets wrong is more useful than what it gets right.

## Licence

GNU AGPL v3.0 — see [LICENSE](LICENSE).
