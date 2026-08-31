---
name: readme-maintenance
description: Keep the README's claims true — the badges, the version and status statements, and the shell lines a reader runs verbatim, none of which any test can decide. Use when editing README.md or when a claim in it may have drifted. Screenshots are not part of this any more; they are placeholders until the interface settles. The failure mode is a sentence that was true when written and is now the first thing a visitor reads.
---

# Maintaining the README

**Almost nothing in the README is asserted**, so every claim in it is only as good as the last person who checked. This skill is the checking.

## 1. There are no screenshots, and that is deliberate

**Do not run the capture scripts.** The README carries no images; what stands in their place is a marker naming what to capture:

```text
<<!PLACEHOLDER - the picker on a fresh install, showing the three groups in the rail>>
```

`rg PLACEHOLDER README.md` is the list of pictures the README owes.

**The reason is the interface, not the tooling.** On the maintainer's call, nothing is captured until the UI settles: an image taken now is wrong within the week, and the chore of keeping five of them true is paid every week until then. So a UI change to Timeline, a graph or the Sentinel wizard **owes nothing** — no regeneration, and no warning about staleness either, because there is nothing to be stale.

**When that changes**, the capture route is the **`visual-check` skill**, never a hand-written Playwright script. Everything this section used to hold about the stale-lock and theme traps went with the scripts; recover it from `git log -- .claude/screenshot_scripts/` if it is ever needed again.

## 2. Claims nothing automates

- **Every badge is a hand-written claim**, not a live reading — they are static shields. Four today: licence, status, deployment and self-hosting. A badge asserting a language or framework is the class that rots first and is read first; there is deliberately none.
- **Status: early development.** The badge and the *Before you start* section say the same thing and must move together. It changes when there is a compatibility story for case data across schema versions — not when features merely stop changing.
- **The Quick start requires Docker and nothing else.** Any claim about a Python or Node version belongs on a docs page, and a version sentence appearing in the README is the drift, not the fix.

### A claim you measured this session is not thereby true in the README

**Run the command the README teaches, and describe the failure you actually saw.** Almost nothing here is asserted, so a sentence about behaviour is only as good as the last person to check it — and the person least likely to check is the one who just measured it, because they already know the answer.

Two that shipped, both caught by review and neither catchable by the suite:

- A paragraph said an unreachable data directory leaves "the app running" with cases in the wrong place. The container had been observed dying on `PermissionError: '/data/cases'` in the same session — that observation is in the body of the very commit that wrote the sentence. **A measurement taken while debugging does not propagate into prose written afterwards.**
- A copy-pasteable setup line used `>` where it needed a merge, and truncated the config file it was meant to extend. **A README shell snippet is run verbatim on a machine with existing state**, and the author's is the machine least likely to show it — the destructive path is the one they are not standing on. Run it against a scratch `HOME` before publishing it.

`tests/docs/test_readme_prose.py` now holds the one thing a machine *can* decide — no prose paragraph appears twice. Everything else is this step. Re-read the README's imperative sentences against what the terminal did, not against what you intended it to do.

## 3. Line wrapping: one paragraph, one line

Every prose paragraph and bullet in `README.md` is a **single unwrapped line** in the source, however long — some run past 350 characters. Markdown collapses soft breaks, so hard-wrapping buys nothing rendered and costs consistency; mixing wrapped and unwrapped paragraphs was cleaned up once already after several were left broken mid-sentence.

Write the whole paragraph on one line, and join any still-wrapped one you find. **Prose only** — code fences, the directory-tree block and the numbered Sentinel-import steps keep one line per entry.
