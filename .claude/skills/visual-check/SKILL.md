---
name: visual-check
description: Visual and layout verification for IncidentCompanion's UI. Use whenever a change touches the workspace shell, navigation, tables, dialogs, the picker, the auth screens or the graph views — anything whose failure mode is "it looks wrong" rather than "a test failed". `npm run visual` in server/ drives the Nest stack; reports layout defects numerically and diffs against a recorded baseline.
---

# Visual check

The unit tier lays nothing out. jsdom gives every element a zero box, so a rail rewrite can pass its own test file unchanged while every number in it is `0px`. A change can pass everything and still ship a header with the search box sitting on top of Add. This skill is that missing half.

**Do not write a new Playwright script for this.** That is the failure mode it exists to end: every ad-hoc sweep re-learns the same lessons badly, and the last one captured twelve "dark theme" screenshots that were all light and reported four cross-browser defects that were not there. Extending `server/e2e/visual/` is not writing one — that *is* the sweep.

**One case is easy to miss, because it is not a layout at all: what a control does *after* an interaction.** A submit that can only fire once, a fold that will not reopen. An import dialog that could not be resubmitted shipped green through both unit tiers. The sweep captures a fresh page and cannot see it either — that one belongs to `server/e2e/prodding.spec.ts`, which presses every control and submits every dialog.

## `npm run visual` is the sweep

It drives a stack that is already running, so bring one up first. The URL comes from `server/scripts/stack.mjs`, so a worktree sweeps its own app:

```bash
./dev-node.sh &                  # this worktree's stack
cd server
VISUAL_BASELINE=1 npm run visual # before your change: record
npm run visual                   # after: capture, probe, diff
```

**The dev server is the default target, and there is no build step in that loop.** `npm run visual` drives Vite, so what it captures is the source on disk — which is the failure this default exists to remove: a palette fix was once made, captured twice against `dist` and read as not having applied, while Vite served the correct code throughout. The remedy taken then was to refuse the dev server, which pointed the guard at the one target that cannot go stale.

**`npm run visual:dist` is what a landing runs**, and the reason is Tailwind rather than ceremony: the build emits only the classes it finds, so a class assembled at runtime can draw in dev and be absent from the bundle — the rule `CLAUDE.md` states as *a class assembled from data at runtime gets no CSS*. That defect is invisible to a Vite capture.

```bash
(cd ui && npm run build) && (cd server && npm run visual:dist)
```

A `dist` run still refuses a stale bundle and a shell with no hashed `/assets` script; neither check fires against the dev server, because there is nothing for `ui/dist` to be stale against when it was never read.

| variable | |
| --- | --- |
| `VISUAL_BASELINE=1` | record this run as the baseline instead of comparing |
| `VISUAL_SECTIONS=timeline,report` | rail **slugs**, not titles; default is every row |
| `VISUAL_GROUNDS=dark` | `light`, `dark`, `system`; default `light,dark` |
| `VISUAL_TARGET=dist` | drive the built bundle instead of the dev server |

Captures land in `server/.visual/current`, the baseline in `server/.visual/baseline`, both gitignored. A full run is **66 captures in ~50s** — every picker pane and every rail section, in both grounds. The rows are discovered, so a new section is swept without editing anything, and asking for a slug the rail does not offer fails the run rather than reporting clean.

**Options are environment variables because Playwright owns argv.** The sweep is a spec (`server/e2e/visual/sweep.spec.ts`) run through its own config, so it gets the tier's TypeScript compilation, its derived `baseURL` and its personas for free rather than growing a second runner.

**`npm run e2e` deliberately excludes the sweep.** The sweep asserts nothing — it reports, because most findings are judgement and a tier that failed on "this chip is 2.9:1" would be off within a week. The one thing it does fail on is not completing: a section that never quiesces, a ground that would not take.

**Then look at the screenshots.** The probes catch geometry, not judgement; they cannot tell you a chip is the wrong colour or that two buttons read as a segmented control. Read the ones the baseline diff names, and always read at least one dark capture — that is where token regressions surface.

## Storybook is the other target, and it holds the states a demo case cannot

The sweep shows the states a demo case happens to produce. Storybook holds every state of every component at once, which makes it the better target for a component-level defect — the ones somebody wrote down rather than the ones the data happened to reach.

```bash
cd ui && npm run storybook        # in another shell, first
cd server
npm run visual:storybook

STORYBOOK_STORIES=Blocks,Layouts npm run visual:storybook
VISUAL_GROUNDS=dark npm run visual:storybook
STORYBOOK_URL=http://localhost:6007 npm run visual:storybook
```

**`npm run visual:storybook`, not `npx playwright test <the spec>`.** Naming the file runs it under the default config, which has neither the single worker the measurement needs -- a second browser competing for the machine is how a settled reading stops being one -- nor the long timeout the whole walk takes. `playwright.storybook.config.ts` is its own file because its precondition is different from the sweep's: that one drives the running app, this drives Storybook, and one command with two preconditions means the half that cannot run looks exactly like the half that found nothing.

It points the same `probe.js` at every story in `/index.json` — contrast, clipping, overlap, offscreen, hit-area, horizontal scroll — and **reports rather than asserts**, the same split as the sweep and for the same reason. The one thing it fails on is not being able to probe: a story that will not render is a fact, not a taste. It skips with a reason when no Storybook answers, as the browser tier skips without a built `ui/dist`. `STORYBOOK_STORIES` matches the story *title* prefix, which is the top-level group — `Components`, `Blocks`, `Legacy`, `Layouts`.

**Why it exists, and it is the argument for looking at all.** A pressed filter chip's label was the same colour as the ground behind it: invisible, on the control an analyst reads to know which filter is on. It survived the unit tier (jsdom has no colours), the story tier (which asserts no contrast), the rule tier (which reads imports) and three adversarial reviewers. A person found it by looking at a screenshot. **A defect nothing in the harness can perceive surviving every tier is the normal case, not the unlucky one** — the tiers agree because they are all blind in the same place, and their agreement reads as coverage.

**Reduced motion, in both directions.** `server/.shot-story.mjs` takes a single story's screenshot, and its settle loop samples `innerHTML.length` and the body's height — a transform moves neither. So a travelling `layoutId` ground photographs *in flight*, under a label that has already taken its selected colour, and the shot reads exactly like a contrast defect that is not there. Both this spec and `.shot-story.mjs` capture with `reducedMotion: 'reduce'`; the app honours the preference through `MotionConfig reducedMotion="user"`, so that is the settled state rather than a suppressed one. `SHOT_MOTION=1` to photograph the motion deliberately.

**Two more things the tier had to learn**: `waitFor` defaults to `visible` and fails a story that draws nothing on purpose, and Storybook renders its own error page rather than throwing.

## Reading the output

Findings are facts about the rendered page, in descending order of how unambiguous they are:

| kind | means |
| --- | --- |
| `h-scroll` | the page scrolls sideways. Never intended here. |
| `clipped-text` | text cut off with no ellipsis — a word ends mid-glyph and nothing says there was more. |
| `overlap` | two controls sit on top of each other. This is the "search collides with Add" class. |
| `offscreen` | a control is cut off past the left or right edge and is not inside anything scrollable. |
| `low-contrast` | a text leaf under 3:1 against the ground it sits on. |
| `small-target` | a click target under 24px in either axis. |

The baseline comparison prints the fraction of pixels that changed per view. Treat it as an index, not a verdict: a 0.1% change on a page you did not touch is worth opening, and a 40% change on the page you rewrote is expected. A view in the baseline that the run did not capture is named too, so a section dropped from the rail cannot hide behind the 64 that still match.

**An empty baseline reads as reassurance, which is why the run says so in different words.** With nothing to compare against it prints *"no baseline recorded"* rather than a count, and an undecodable capture prints `!` rather than counting as unchanged. Both shapes cost real coverage on the tier this replaced, where a baseline of 80 views became 16 and the next sweep reported no differences while holding none of them. If you changed a page and the run reports no difference, check `server/.visual/baseline` actually holds that view before believing it — the same empty-set shape that makes a test pass over nothing.

## What the sweep needs you to know

- **The sign-in is the SPA's own form.** A session cookie does not sign it in: `App` renders from the display identity in `localStorage`, which only `SignInForm`'s success path writes — so a probe that claims through the API and navigates to `/` screenshots the login card in every combination.
- **The ground is `<html data-theme>`**, driven through the ground switcher and read back. `VISUAL_GROUNDS` takes `light`, `dark` and `system`; `system` has no document form — it resolves through `matchMedia`, so that pass runs the browser at `prefers-color-scheme: dark` and checks the resolved ground followed. The switcher is a fixed card in the bottom-right of every capture; the probes exclude it, or it overlaps whatever the pane puts in that corner on every screen in every combination.
- **A virtualised list is a window, not a table.** Timeline and every `DataTable` virtualise at 50 rows, so the sweep reports `19 rows in the DOM of 86 in the case` rather than a row count. Do not read a DOM count as a total.
- **The tier drives the built bundle, so `npm run build` in `ui` comes before every sweep.** The browser tier's `baseURL` is the Node server, which serves `ui/dist` as static assets - `unservedReason` refuses a Vite dev server outright, because a shell whose script is `/src/main.tsx` is the one thing this tier must not be pointed at. Vite on its own port is a different server that nothing here talks to. **This entry used to say the opposite** - *no staleness guard is needed, the sweep captures the source on disk* - and that sentence is what stopped anyone checking: a palette fix was made, captured twice and read back as not having applied, while Vite served the new class string all along. A stale capture is pixel-identical to a correct capture of code that has not changed. `asPersona` now refuses the run rather than reporting on the previous build, so this is a one-line remedy rather than a trap - but the build is still yours to run.
- **The picker comes first, and it is not an afterthought.** Every finding the earlier tier ever reported on this app was on a picker pane, so a sweep walking only the case rail reports "no findings" while holding none of the views that had any. Naming `VISUAL_SECTIONS` skips the picker walk.

Driving lives in `server/e2e/visual/view.ts` — the quiescence that throws, the three-pass probe, the capture and the ground — over navigation that `server/e2e/support/app.ts` already owns. Positions are asserted in `server/e2e/sections.spec.ts`.

**Not covered, and named rather than skipped silently:** the command palette, the hover cards, the collapsed rail, the dialogs and the four unauthenticated screens. The default grounds are `light,dark` — ask for `system` explicitly.

## After changing the probe — **or the section action row's markup**

The probes are checked by `server/e2e/visual/selftest.spec.ts`, which breaks the page on purpose seven ways and asserts each finding fires. `npm run e2e` runs it; to run it alone:

```bash
cd server && npx playwright test e2e/visual/selftest.spec.ts
```

**The second trigger is the one that bites**: every fault is injected into the sweep section's action row or the rail's labels, so a markup change there makes a mutation throw and the run dies having asserted nothing — after an edit that touches no file this skill names.

Nothing else catches it. Both unit suites and a full sweep stay green, because none of them runs the probes against a page that is *meant* to be broken, and a sweep reporting "no findings" means nothing unless the probes can still bite: that spec caught two real defects in the probe within minutes of being written, one of which silently disabled the entire `offscreen` check whenever the page scrolled sideways.

**Porting the faults to this tier cost three of the seven, which is the argument for running it rather than trusting it.** They were written against a header at the top of the page; the action row sits at roughly x=1150, y=89, so `right:40px;top:8px` landed on empty background and `overlap`, `offscreen` and `low-contrast` all reported "nothing fired". They are positioned from the first button's live rect now. `low-contrast` moved to a rail label as well, because the rule skips any element with element children and a toolbar button holds its text as a bare text node beside an `<svg>` — there is no leaf in the row to measure at all.

## Why the probes are shaped the way they are

Every one of these is a mistake already made in an ad-hoc sweep of this app. They are in `server/e2e/visual/probe.js` and `server/e2e/visual/view.ts` as comments too, next to the code that handles them.

- **Every state change verifies its postcondition.** Setting the ground reads it back, opening a section waits for the URL *and* the active row. An earlier sweep clicked what it hoped was the theme switcher, slept, and produced twelve light screenshots labelled dark. A run that captures the wrong page and calls itself clean is worse than no run.
- **Quiescence waits for network idle and then polls a geometry fingerprint until two consecutive samples agree, and it throws rather than returning.** Fixed sleeps measure mid-transition — that is where a reproducible-looking "24px header overflow" came from when direct measurement showed 20px of clearance. A React screen is stable *while it is still empty*, so the fingerprint alone certifies the loading state and finds nothing on it.
- **Findings must survive three passes 400ms apart.** Two passes 250ms apart was not enough — a phantom survived both, in every combination, which is exactly the signature of a real cross-browser defect.
- **Never collapse several conditions into one unlabelled number.** The first `offscreen` check took `Math.max` over all four edges, so an edit pencil *below the fold* on a scrolling page reported as "606px past the viewport". Reproducible and entirely by design. Report which axis fired.
- **Compare per-line boxes, not the bounding rect.** A wrapped inline element's `getBoundingClientRect` is the *union* of its lines, so a link whose text wraps measures as wide as its container and two lines tall — and collides with every other link on either line. That reports two links that touch nothing as overlapping, in both grounds. `getClientRects()` gives one box per line; a block element has one either way, so nothing else moves.
- **Ask whether an ancestor is scrollable, not whether it overflows.** An ancestor's `scrollWidth` grows *because* of the overflowing child, so testing it excuses the element under test. Test `overflow-x: auto|scroll` instead: `visible` merely spills, and `hidden` means the control is unreachable, which is a defect rather than an excuse.
- **Anything hidden but present is excluded** (`[aria-hidden]`, a shut `<details>`, `.sr-only`, an open dialog's own scrim). A shut fold keeps its contents in the tree with real geometry, so without the exclusion the probe measures fifty invisible checkboxes stacked over the controls below them and reports an `overlap` in every combination. A new overlay kind needs adding to `server/e2e/visual/exclude.ts` — with its children, or every row is a candidate on its own.
- **Toasts are removed before capture.** A notification across the bottom of a screenshot is indistinguishable from a layout bug when you come back to the image later.
- **Selectors use real handles.** Prefer a `data-testid`; plain text is worse than it looks, since an icon's name is findable text and prose about the demo case matches `text=Demo case` as readily as the button does.
- **Nothing inside an `svg` or `foreignObject` is a control**, and both the contrast check and the target checks exclude them. The graphs paint icon badges into `foreignObject`, so including them reported an 11x11 glyph on a node card as an 11x11 click target — on both graph pages in both grounds, which is exactly the signature of a real cross-browser defect and was filed as one. **An icon is evidence about the control it sits in, never a control itself** — the second false positive this selector produced, after the overlap noise that got an earlier widening reverted.
- **Captures go to a scratch directory, and nothing is published.** There are no shipped images: the README carries `<<!PLACEHOLDER - what it should show>>` markers until the interface settles. When that changes, this skill is how a capture gets taken.

## A full-viewport capture hides a small defect — crop it, then measure it

**A 4px artefact on a 1440px page is a smudge you will not see, and the sweep's probes do not look for it.** A nub above a timestamp, a 14px sideways offset, a gap where two background bands meet: all of them were reported by the maintainer off a zoomed crop, after being looked at and passed in a full capture — repeatedly, in one session.

Two habits, in this order:

- **Crop the region at scale.** Playwright's `clip` takes a rect, so a scratch spec beside `server/e2e/visual/sweep.spec.ts` captures one column in a few lines. Find the x from the DOM rather than guessing it — a crop computed as "46% of the pane" landed 44px off the element it was meant to show, and the first round of inspection was of the wrong strip.
- **Then read the boxes, because a crop still only shows you what you thought to look at.** Collect the elements with `getBoundingClientRect`, sort by `top`, and assert the relationship you actually mean — each `bottom` equal to the next `top`. That dump ended a run of "fixed it" rounds in one call, and showed one reported gap was not a gap at all but a label deliberately masking the line behind it. **A rect is where an element is laid out, not where it is painted**, and knows nothing about an ancestor clipping it — so clamp against the scrollers above it before believing a number, exactly as the probe has to.

**Say which one you did.** "Looks right" after a full-viewport glance and "the rects are contiguous" are different claims, and only the second survives someone zooming in.

## What this cannot do

- **One viewport.** The sweep runs at **1440x900** and nothing varies it, so a width-dependent collision is outside what it can see. The riskiest layout in the app is the one the sweep sees at exactly one size, so a control sized from free space beside a section's action buttons is worth checking by hand.
- **Zoom.** A browser at 125% is a different layout, and nothing here changes `deviceScaleFactor` or page zoom.
- **Judgement.** One filled primary per view, whether a chip's tone is right, whether spacing reads as cramped — look at the images.
- **Interaction beyond navigation.** Dialogs, bulk select and the graph views are captured in whatever state a fresh page shows them. Driving those is a helper away in `server/e2e/visual/view.ts`; add it there rather than in a throwaway script.
- **Replacing the behaviour tiers.** Persistence and layering belong in what `./verify.sh` runs. This checks what the analyst sees.
