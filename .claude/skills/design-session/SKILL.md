---
name: design-session
description: Work out the shape of a UI change in an Artifact before building it — measured facts first, then options with to-scale mockups, then the decisions the analyst has to make, then a prototype of the direction they chose — held at a stress case taken from the code rather than imagined. Use when the shape of a change is genuinely open and the call is theirs; not for a bug fix, and not when there is one obvious answer. The failure mode is a beautiful document arguing from numbers nobody re-measured.
---

# Design session

**An Artifact is a draft pad, and its value is the measuring, not the mockup.** A design session that opens with a proposal is an opinion with pictures. One that opens with four numbers taken from the running code is a document the next decision can be built on — and the numbers are what make the options fall out, usually to fewer than you expected.

The timeline spine came out of one of these. Five candidate directions went in; three were eliminated before any of them was drawn. **Leave as is** and **fit to pane** fell to arithmetic on the first page, and **entity swimlanes** fell to a memory lookup that identified it as a page already designed under another name. That left two, one of which was additive rather than competing — so the actual choice was a single yes.

**Load two skills before writing the page**, and in this order:

1. the **`ui-design`** skill — what the interface is built out of and how it has to read. Every option you draw is scored against it, so reading it after the mockups means drawing an option the component policy already refuses. `.claude/skills/ui-design/references/state-lattice.md` is what stops a session designing only the populated screen.
2. the bundled **`artifact-design`** skill — how the page itself is built.

`artifact-design` governs the document; `ui-design` governs the thing the document is about; this skill is the procedure that goes *in* it. A design session that opens `artifact-design` alone produces a well-made page arguing for a control this app does not build.

## Measure first, from the code, in this session

**Every number in the document comes from a command you just ran.** Not from a screenshot, not from a memory file, not from a previous session's finding.

```bash
.venv/bin/python - <<'PY'
import os, tempfile
os.environ["INCIDENTCOMPANION_DIR"] = tempfile.mkdtemp()
from app import demo_case, vis_timeline
case = demo_case.build_demo_case()
svg = vis_timeline.render(case.timeline, case=case)
# ...measure the thing the design is about
PY
```

That is what produced **2040 x 366px into an 1130px pane**, and that single number decided the layout. Designing against the remembered version of it would have produced a document about the wrong problem — see CLAUDE.md's rule about acting on a stale finding, which costs more than ignoring one because a finding is the input to a *decision*.

Where the subject is a page rather than a function, run `visual-check`'s `npm run visual` and measure the captures rather than writing a script.

### Measure the *fix*, not only the defect — the defect's number decides nothing

**A number that sizes the problem is the easy one, and it does not tell you whether the remedy is worth building.** Only the fix's number does that, and it is the one that gets skipped because the problem's already feels like evidence.

A number can be real and still be the wrong question. The sign-in screen below `lg` measures **87% empty viewport**, which reads as *missing content* — but what is wrong is the *role* the empty area is painted in: the form pane keeps `bg-card`, so narrow it paints the page in the raised token with nothing left to be raised above. Two classes. Its contrast:

| | dark | light |
| --- | --- | --- |
| `--card` vs `--background` — the fill swap | **1.09:1** | 1.03:1 |
| `--border` vs `--background` — the edge a `Card` adds | 1.40:1 | 1.31:1 |

**1.09:1 is imperceptible.** The entire visible improvement was a faint outline. Four options had been drawn and costed before anyone computed the two lines of arithmetic that ended the question — and the maintainer ended it by asking "what does that fix do then?", which is the question this section exists to make you ask yourself first.

**So before the options: state the remedy in one sentence and put a number on it.** If that number is below perception, the deliverable is a record of the decision *not* to build — a design record under the capability it belongs to, which is worth more than the change, because otherwise the next person rediscovers the 87% and reopens it.

## Check whether the obvious fix is already refused

**The most valuable thing in a design session is often a rejection somebody already reasoned through.** Before proposing anything, look for the mechanism that looks like it should already solve this, and read why it does not.

The timeline session found `fit_on_load`, which exists, is used by a neighbouring page, and clamps at `Math.max(1, ...)` with a comment saying shrinking would mean more of the case rendered smaller. That killed a whole branch before any design happened, and it went into the artifact **as a constraint with the code quoted**, not as a footnote.

Do this even when — especially when — the mechanism's name suggests it is the answer.

## Name every rule the design breaks, and bring the break to the user

**A design that improves the screen and contradicts a written rule is the normal case, not the exception.** `rules/` records decisions that were right when they were made, against the screen as it was then. A session that changes the screen changes what some of them are arguing about — so the rule does not get quietly worked around, and it does not get silently obeyed either.

Do this after measuring and before drawing options, because it changes which options exist.

1. **Read the rules for the area you are changing**, from CLAUDE.md's routing table — plus the tests they name. A rule that names a test is a rule with teeth; check what that test actually asserts.
2. **For each candidate direction, name what it would break.** Rule, test, or both. If nothing breaks, say so; that is a real finding about how much room the design has.
3. **Read the rule's *premise*, not only its conclusion.** Most rules here are `<condition> → <consequence>`, and a design usually changes the condition. "Two tinted vocabularies **on one row** need different weights" stops applying the moment one of them leaves the row — the conclusion was never the durable part.
4. **Decide whether breaking it is an improvement**, with the measurement in hand. Say what the rule was protecting and whether the new arrangement still protects it by other means.
5. **Put it in the artifact and then ask.** The break is a decision the user makes, not one the session makes and reports. It is one of the closing `AskUserQuestion` items, with the rule quoted and the cost stated.

**The rule is then rewritten to say what is true now, not amended with an exception.** "Here is the old rule, and here is why my case is different" is the shape to avoid: it leaves the stale framing leading, and the next reader follows it. The old wording survives in git history, which is where a superseded decision belongs.

Two failure modes, both seen:

- **Obeying a rule whose premise your design removed** — the design comes out worse for a reason nobody can find later, because the rule still reads as correct.
- **Breaking one without saying so.** It lands, the rule stays on the page contradicting the code, and the next session either re-applies it or spends an hour deciding which one is authoritative.

## Build it with real content, at true proportion

- **Real content, never lorem.** The demo case's actual entries, with their actual timestamps. A mockup of plausible data hides exactly the cases that make the design hard.
- **Hold proportion as a ratio, not a pixel scale.** The overflow figure was a stage at `width: 180.5%` inside a pane box, because 2040/1130 is the fact and it stays true at any viewport the reader happens to have.
- **Render a failure case at its real scale factor**, do not describe it. "0.55x is too small" is an assertion; a card drawn at 6.6px is the evidence, and it takes three lines of CSS.

## Design the stress case, and pick its ceiling deliberately

**Choose the hardest case the design has to hold before drawing it, not after.** It is a design input like the measurements are; picked afterwards it is chosen to be one the drawing already survives.

**Stress it properly, and stop at the edge of real.** `DEMO` is the shortest case ID the app can hold, so a block tuned against it is tuned against a string nothing real looks like. `RANSOM-FIN-2026-11-03` is the stress case, and at that width the identity block is a different block. The two directions fail differently:

- **Under-stressed** ships a layout that breaks on the second real case, and the break is invisible until then.
- **Over-stressed** is worse than it looks, because the design tax is permanent. A 500-character customer name buys a truncation rule, a scroll, or a second row that every ordinary case then pays for — a control designed for a case nobody has.

**Take the ceiling from the code or from a real export, never from imagination.** The server publishes three of them, so read them rather than grepping:

```bash
curl -sk https://localhost/api/settings | jq .limits
```

`MAX_ATTACHMENT_BYTES` is **256MB** (`server/src/evidence/store.ts`), beside an archive cap and a passphrase length. A list stressed at a smaller number is designed for a case the app does not have, so read the constant rather than recalling it. A select's stress case is its whole vocabulary. Where the server states no limit, the ceiling is what a real SIEM export or a real customer produces — run the importer over one and count.

- **Stress the axis the design is about.** For a table that is row count and the longest value in the widest column; for a graph, node count and the deepest lane; for a header, the number of actions plus the longest title.
- **Group before you count.** 96 identical Sentinel beacons are **one** card, so the timeline's stress case is distinct beats, not raw entries — stressing the number the renderer never sees measures nothing.
- **Render the stress case beside the typical one**, never instead of it. A design shown only at its ceiling is tuned for the case nobody has, which is the over-stressed failure arriving by the back door.
- **Say the number on the page.** "At 120 characters" and "at 40 rows" let the reader disagree with the ceiling instead of with the design — and the ceiling is the part they know better than you do.

## Label what kind of claim each section makes

A design document mixes measured fact with proposal, and a reader who cannot tell them apart will quote your proposal back as a finding. Give each section a short marker — `MEASURED`, `CONSTRAINT`, `FINDING`, `OPTION`, `CALL`.

This is information design, not decoration: it is the one structural device in the page that encodes something true about the content rather than numbering it for the sake of numbering.

## Name what is *not* an option

Entity swimlanes looked like a third direction for the timeline. They are substantively the **lateral-movement page that was already designed and stashed**, so building them there would have built that page twice, under two names, and neither would have been the one that was designed.

Check memory and the queued work before listing a direction. An option that duplicates something already decided is worse than a missing option, because it looks like progress.

## Keep one wildcard in the set

**When the options all refine the same mechanism, the set has narrowed too early — add one that questions the premise.** A, B and C for the chip were all "how do we mark a continuation chip"; the maintainer stuck between them because they shared an assumption none of them tested. The way out was a reframe: the cold read is *native to pills* — every value is an identical box, so a continuation box looks like a new fact — so the wildcard was "drop the pills entirely". It won. A refined option narrows *within* the frame; a wildcard changes the frame, and it is exactly what a session deadlocked between near-ties is missing.

- **Reframe the problem, not only the solution.** "How do we mark the continuation" and "why is a bare continuation ambiguous at all" are different questions, and answering the second dissolved the first. When two options sit close, name what they both assume and put its negation on the table.
- **Float it even when it looks too big.** The drop-the-pills direction was the largest change on the board and still the right one. Costing it honestly — a rule reversal, a test rewrite, a stale README — is the artifact's job, not a reason to leave it off. The stress test and the spike are what tell a big-and- right wildcard from a big-and-wrong one.

## End with the decisions you need

Four questions, each one a thing you cannot answer from the code. That is what let the timeline session go from "A is the best idea" to a merged branch without a second round of clarification.

**Ask them with the `AskUserQuestion` tool, not as prose at the bottom of the artifact.** A question written into the page is answered in whatever order and wording the reader feels like, and a session that needs a second round of clarification has spent its whole advantage. The tool takes up to four questions of two to four options each — the same shape the section already asks for — and it returns a decision per question rather than a paragraph to interpret.

- **The artifact carries the evidence, the tool carries the choice.** Put the measurements, the mockups and the rejected directions in the page; give the tool the one-line option labels and the consequence of each. Restating the reasoning in the option descriptions is how the two drift apart.
- **Use `preview` when the options differ in shape rather than in kind** — a layout, a control arrangement, a snippet. The mockup is already drawn; a few lines of it beside the label is what makes the choice readable without going back to the page.
- **A rule you propose to break is one of the questions**, never a line in the artifact the reader may skim past. Quote the rule, state what it was protecting, and say what the break costs, as stated earlier.
- **Lead with your recommendation** as the first option, marked `(Recommended)`. A session that ran the measurements has an opinion, and withholding it makes the reader redo the arithmetic.
- **Send the artifact URL before calling the tool**, or the options arrive with nothing to read them against.

If you find yourself with no open questions, the session was probably not needed — you had one obvious answer and should have said so. Do not manufacture a question to fill the tool call.

**A second round is a failure only when it clarifies what you could have measured.** When the *maintainer* opens a new direction off your options — "what if we don't use pills at all", "try a different mark", "stress it first" — that is the session working, not a lapse: the space was wider than the first option set and they found its edge. Keep one artifact, mark the rounds (`round one`, `round two`), and answer the steer with a fresh option set rather than restarting. What you still never do is invent a round to stand in for options you could have arrived at by measuring.

## Go to a prototype once the answers are in

**A visual change ends this session in a prototype, not a recommendation.** The brief and its mockups answer *which* shape; none of them answers whether that shape survives real content at real size in both grounds. There are two kinds of prototype, and the choice is where the shape will live.

Go when all three hold: the questions are answered, one direction is left, and what remains is arrangement — spacing, order, state, what a control shows when there is nothing to show. **Do not go** when the decision is a rule, a threshold, an access rung or anything whose failure is not something you can look at; there the answer is the recommendation and the implementation. And do not spike a change too small to earn it — a one-line tweak's prototype is the diff.

### The real-app spike — for a change that lands in the app

**The strongest prototype is the change itself, built rough in a worktree and captured with `visual-check`.** It renders the app's real markup and real cascade, so it catches what a mockup structurally cannot. The chip-continuation spike's first render painted every entity value in UPPERCASE: the new class `.c-fact-link` collided with an existing About/Settings rule carrying `text-transform: uppercase`. No drawing could show that — it exists only in the live cascade. Renamed `c-mfact-*`, gone. This is the prototype to reach for whenever the change will end up in the app.

- **It is a spike, not the build.** Rendering only: the tests are not green, the machinery it replaces is still in place. Its one job is to answer "does this shape hold", cheaply enough to throw away. Promote it to the full build — retire the old machinery, rewrite the tests with break-verify, land — only once the shape is confirmed.
- **Promote the shape. Never the code.** This is the one that actually goes wrong, because the spike is sitting there working and porting it feels like the cheap path. A lab is deliberately unconstrained: nothing is wired, no rule bites, and hand-drawing a canvas to try five layouts in an afternoon is correct *there*. Carried across, that same file is a screen built from none of the kit — and every polish note against it afterwards is a defect the primitives never had. A promoted spike measures its own text, positions its own panel and writes its own Escape and click-away, all of which the kit already does. **Re-read `ui-design` and build from the blocks when the answer is picked**; the spike's job ended when it answered the question.
- **Stress it by feeding the hard case to the demo case, then revert.** Append the hard rows to `demo_case.build_demo_case()` in the worktree, capture both grounds with `visual-check`, and **revert the demo-case edit — never commit it.** The chip spike did this with an 8-recipient row and a 3-account/3-indicator/2-malware row, neither in the demo case, and saw the text wrap like prose where the pills had pooled into one ambiguous `+5`. A drawing renders the stress case at true *proportion*; the real renderer renders it at true *behaviour* — wrap, fold, overflow, cascade.
- **`visual-check` serves whichever checkout you launch it from.** Run it from the worktree, or it captures the code *without* your change and reports the old shape. → `rules/git-workflow.md`

### The HTML sketch — for a shape not yet in the app

When the point is to *choose between* shapes before any of them exists in code, a published artifact page is the cheaper prototype. It is a second artifact at its own file path — redeploying over the brief mints no new URL and costs the measured record the decision was made from. Link the two both ways.

- **Take the token *values*, not the CSS block.** `Theme.css_block()` writes `body[data-theme="…"]`, and a published page carries its theme on the root element, so a pasted block matches nothing and the page paints its own fallbacks while looking deliberate — the same silent miss as an ad-hoc Playwright script. Read the values out and declare them under whatever selector the page actually uses.

```bash
.venv/bin/python - <<'PY'
import os, tempfile
os.environ["INCIDENTCOMPANION_DIR"] = tempfile.mkdtemp()
from app import theme
for t in theme.THEMES:
    print(t.name, t.dark, t.tokens)
PY
```

- **Both grounds, side by side, in the page itself.** A published page follows the *viewer's* theme, so a sketch that renders one ground shows whichever one the reader happens to be in and hides the other — and a colour that reads on white is invisible on a dark page, which is why `app-danger-*` and `app-kc-*` default per ground at all.
- **Every state the screen really has**, not the populated one: empty, one entry, and the stress case above. The populated middle is the state that needs no design.
- **Interactive only where the decision is about interaction** — hover, expand, collapse, zoom. Everything else is static, and faking app behaviour the decision does not turn on is how a sketch becomes a second implementation nobody tests.
- **Stop when it stops answering questions.** It is a draft pad; the fidelity it needs is the fidelity that settles the last open arrangement, no more.

## Afterwards

- **Redeploy the same file path to update.** A different path mints a new URL and strands the one you sent.
- **Link it from memory if the work is queued**, with the URL. A design session that nobody can find again is a session that gets run twice.
- **A prototype is not a build, and this is the trap that matters.** The spine artifact's *sketch* was correct, the recommendation was right, and the implementation still shipped two defects it could not have shown: a long gap collapsing to 57px after a dense burst, and valueless `data-*` attributes that render fine in the app and break every exported file. **Do not let a good design session shorten the verification** — the suite, the browser and the exported bytes still owe you their answers whichever prototype you built. A *sketch* is worst for this: it raises how verified the page looks while rendering none of the app's real markup and nothing that leaves as a file. A *spike* renders all of that, so it catches more — but it is rendering-only, so it has run neither the suite nor the browser interaction the change still owes.
- **Re-measure before acting on it later.** The artifact records what was true when it was written. Numbers in it go stale exactly like a visual-check finding, and for the same reason.

## What this is not for

- A bug fix, or a change whose shape is already decided.
- Anything with one obvious answer — write the answer.
- Work you are going to do anyway regardless of the reply. If the artifact is a status report rather than a question, it is a message, not a session.
