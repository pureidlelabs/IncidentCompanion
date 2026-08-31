---
name: ux-audit
description: Judge the app's UI blind, then work out which of its own design rules the findings put in question — capture real screenshots, hand them to an uninformed critic, reconcile what comes back against the design docs, and report it as an Artifact the analyst answers. Use when asking whether the UI is good rather than whether a change is correct, or when a rule feels like it is holding the design back. The failure mode is an audit that reads the design system first and can then only ever find drift.
---

# UX audit

**A reviewer who has read the design system can only find drift.** Grade the UI against its own rules and every deliberate mistake reads as correct-by-definition — the rule *is* the standard. This skill exists to find the other thing: a rule that is itself wrong, or right once and now load nobody is carrying.

So the order is not negotiable. **Opinion first, from pixels, by someone who cannot look it up. Documentation second, as the defendant.**

This is not `design-session` (working out the shape of an open change with the analyst) and not `visual-check` (measuring whether a rendered page is geometrically sound). It uses the second and sometimes feeds the first.

## The four phases

| phase | who | reads |
| --- | --- | --- |
| 1. Capture | you | the running app |
| 2. Critique | `ux-critic` agent | the screenshots, nothing else |
| 3. Reconcile | you | the findings, then the design docs |
| 4. Decide | the analyst | your Artifact |

**Never run 3 before 2 is back.** Opening the `ui-design` skill while the critic works is how the reconciliation becomes a defence written by the accused.

---

## Phase 1 — capture the real app

**Screenshots of the running app, always. Never rebuild a screen in HTML to illustrate it.** A rebuild is a drawing of what you believe is there, it costs more than the capture, and the one detail you got wrong is exactly the one worth auditing. The whole method rests on the critic seeing what shipped.

```bash
./dev-node.sh &                  # the stack the sweep drives
cd server && npm run visual      # every picker pane and every rail section
```

Output lands in `server/.visual/current`. **Both grounds:** a colour decision that only works on one is the commonest thing a single-ground sweep certifies as fine, and `light,dark` is the default — leave `VISUAL_GROUNDS` alone.

- **Run it from the checkout you mean to audit.** From the main checkout while the UI change sits in a worktree, it captures the app *without* the change and reports on code that no longer exists.
- **Re-capture rather than reusing yesterday's run.** A finding goes stale exactly like a test does, and here it is the input to a rule change. → `.claude/rules/git-workflow.md`
- Read the sweep's own findings (`h-scroll`, `overlap`, `small-target`) before dispatching. Those are facts; hand the critic the pictures and keep the numbers for phase 3.

### Auditing one part of the app

The capture layer scopes, so a narrow run is one critic instead of four:

```bash
VISUAL_SECTIONS=timeline,assets npm run visual   # slugs, not titles
```

**What a targeted run cannot find is the class of defect worth the most.** Consistency findings are invisible from inside one screen — the first full run produced three that only exist because a critic held a dozen at once: an icon column whose Delete sits where Duplicate sat on every row above, one theme file reporting 38 tokens on its row and 18 in its editor, and entry counts rendered two different ways on adjacent pages. Right for "is this new dialog any good"; wrong for "why does the app feel inconsistent".

**A single-pane run also reaches a trap the full sweep never does.** The "you are already here" guard makes an open editor impossible to leave, and it is only reachable when that pane is *last* in a run — so it fires immediately on a one-pane run and never on a sweep.

## Phase 2 — the blind critique

Dispatch the **`ux-critic`** agent. It has `Read` and nothing else, so it cannot go and find the design system.

**What you send it: image paths, and the one-paragraph description of what the app is for that already lives in its own prompt.** Nothing else.

**What you must not send** — each of these turns the blind pass back into a drift check:

- any rule, prefix, token name or convention
- the reason a screen is the way it is
- your own opinion, including as a question you want checked
- the diff, the branch, or what changed recently
- a previous audit's findings

Batch by screen family (workspace sections, picker panes, dialogs) rather than sending all of them to one agent — a critic holding 40 images ranks within the batch and the cross-screen findings get thinner, which is where the consistency defects live.

Run the batches in parallel. They must not see each other's output.

## Phase 3 — reconcile, and put the rules on trial

Now read the `ui-design` skill. Sort every finding into exactly one of four buckets. **The third is the deliverable; the other three are hygiene.**

| bucket | test | what it becomes |
| --- | --- | --- |
| **drift** | a doc already forbids this, and the screen does it anyway | a bug to fix; no rule changes |
| **gap** | the docs are silent | a candidate new rule |
| **challenge** | a doc *mandates* the thing the critic disliked | **a rule the analyst is asked about** |
| **dismissed** | the critic could not see a constraint that makes this right | nothing, plus a written reason |

### Dismissing costs a citation

**A dismissal must name the commit or the measurement, not the rule.** "The design doc says so" is not a reason a rule is right; it is the claim under test. `git log -S<symbol>` then `git show <sha>` — this repo argues for its decisions in commit bodies and most dismissals are already written there.

If you cannot find one, it is a **challenge**, not a dismissal. That reclassification is the single most valuable thing this phase does, and the bias runs the other way by default: a plausible reason is easy to reconstruct, and reconstructing it is indistinguishable from remembering it.

Expect real dismissals, though — the critic is blind to constraints that are not on screen, and this app has expensive ones:

- **the report's destination is Word**, which is why visuals are shaded tables and graphs leave as PNG
- **no migration layer**, so a vocabulary cannot be narrowed without stranding every case already holding a value → `.claude/CLAUDE.md`
- **an export has no theme to consult**, so a DOM colour and an SVG colour are two decisions on purpose

### A challenge is a rule plus its cost

For each one, carry into phase 4:

- the rule, **quoted**, and where it lives
- what the critic saw, in their words
- what the rule was bought with — the commit, and what it prevented
- **what it costs now**, which is the part nobody has written down
- whether the analyst's answer changes code, changes a doc, or both

**A rule with no findable origin is not automatically wrong.** Some are taste, correctly held. But an unattributable rule that is also costing something is the strongest possible candidate for the question.

## Phase 4 — the report, then the questions

Load the **`artifact-design`** skill, then build the Artifact.

### Real screenshots, embedded

**Every finding shows the actual capture it came from.** The CSP blocks every external host, so images must be `data:` URIs — downscale first or the page becomes unopenable:

```bash
cp /tmp/incidentcompanion-visual-check/current/chromium-dark-Timeline.png /tmp/f.png
sips --resampleWidth 1100 /tmp/f.png >/dev/null      # ~200-350KB at PNG
python3 -c "import base64,pathlib;print('data:image/png;base64,'+base64.b64encode(pathlib.Path('/tmp/f.png').read_bytes()).decode())"
```

Crop to the finding where the whole screen is not the point — `sips --cropToHeightWidth` — and keep one full-screen capture per family for context. Budget roughly 8–12 embedded images; past that the Artifact is slow to open and nobody scrolls to the bottom, where the challenges are.

### Anything *proposed* stays a sketch

**Do not build a polished HTML rebuild of a proposed alternative.** It is expensive, it reads as a decision already made, and it invites review of the mockup's own details instead of the choice. A labelled box diagram, an ASCII frame, or a crude div layout beside the real screenshot carries the idea:

```
  current                          sketch
  ┌────────────────────────┐       ┌────────────────────────┐
  │ [sev] Title      12:04 │       │ Title            12:04 │
  │ desc                   │       │ [sev] desc             │
  └────────────────────────┘       └────────────────────────┘
```

The real screenshot is the evidence; the sketch is the question. Keeping them visually different — photo beside line drawing — is what stops the proposal borrowing the evidence's authority.

### Structure

1. **What was captured**, and what was not. Coverage before findings, or silence reads as approval.
2. **What works** — the critic's list, unedited except for anything you can now attribute to a rule, which is worth naming as a rule that is earning its keep.
3. **Drift** — a short table. Bugs, not decisions.
4. **Rules under challenge** — one section each, the screenshot, the quoted rule, its origin, its cost now. This is the body of the document.
5. **Gaps** — candidate rules, if any.
6. **Dismissed, with citations.** Publishing these is what makes the rest credible; a report that only accuses reads as a critic with an agenda.

Then ask the analyst — `AskUserQuestion`, **challenges only**, batched four at a time. Options are the rule as it stands, the critic's direction, and a narrower reading where one exists. Say in each option what it costs to change: a rule in `rules/` is one edit, a rule the code enforces through a test is three.

## Landing the answers

**A decided rule change that is not written down gets re-litigated**, and this repo's docs are its memory.

- The rule changes in `.claude/skills/ui-design/` or the owning `.claude/rules/*.md`, with the reason it *changed*, in the same change as the code.
- A rule pinned by a test (`test_every_cancel_is_the_quiet_button`, `test_the_kill_chain_is_the_only_chip_with_a_coloured_border`) changes in the test too, or the suite reverts the decision at the next edit.
- **A rule the analyst keeps is not a no-op.** Record what it now costs, where the rule lives — that is the finding the next audit does not have to rediscover, and the one whose absence made this audit necessary.
- Anything left open goes to memory via `memory-hygiene`, not to a plan file.

**"The design system is in good shape" is a real outcome.** Do not manufacture challenges to justify the run; a phase 3 that dismisses almost everything *with citations* has confirmed something nothing else here can.
