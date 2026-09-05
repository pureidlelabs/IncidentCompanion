# Motion

*Load when adding a transition, a spinner, or anything that moves. The short version: this app barely moves, that is deliberate, and the burden is on the thing you are adding.*

## What the app actually does today

Measured on the tree at 2026-08-03, across the whole of `ui/src`:

| | count |
| --- | --- |
| `animate-spin` | 2 |
| `animate-pulse` | 2 |
| `transition-all` | 2 — `button.tsx`, `progress-bar.tsx` |
| canvas animation | 1 — `ambient-field.tsx`, on the unauthenticated screens only |

**Nothing on a working screen animates.** No row entrance, no stagger, no page transition. An analyst sits in this app for a shift and every millisecond of motion is a millisecond the row is not readable yet.

## The tokens, and there are only three

```
--duration-fast: 120ms
--duration-base: 180ms
--ease-out: cubic-bezier(0.16, 1, 0.3, 1)
```

A duration written as a literal is the same defect as a hex written outside `tokens.css`. If a thing needs a fourth duration, that is a conversation, not a number typed inline.

## Should this animate at all

| How often the analyst triggers it | Answer |
| --- | --- |
| Many times a shift — typing, toggling, moving down a table | **No.** Speed is the feature. |
| Hover, opening a menu | `--duration-fast`, or nothing |
| A dialog, a panel | `--duration-base` |
| Once — the unauthenticated field | may be expressive, and is |

**The test is not "would this look nice".** It is: does the movement tell the analyst where something came from or what state it is now in? A fade that communicates nothing is a delay with a curve on it.

## Rules

- **Never `transition: all` / `transition-all` in new code.** Name the properties. `all` animates things you did not mean — a layout property sneaking in is a repaint per frame on a table that may hold thousands of rows. The two existing uses predate the rule and are on a toast and a progress bar, which have one property each anyway.
- **Animate `opacity` and `transform` only.** Anything else is off the compositor and lands on the table's scroll.
- **Exit is faster than entry** — roughly 75%. A thing leaving has already been read.
- **`prefers-reduced-motion` on everything that moves.** The pattern to copy is `ambient-field.tsx`: it does not animate invisibly, it stops issuing frames. Colour and opacity transitions may stay — they do not cause motion sickness.
- **No bounce and no overshoot** -- on a security tool that reads as a toy. `--ease-out` is the curve for a transition.
- **Springs are the app's own vocabulary and are not overshoot.** `lib/motion.ts` names them, and each exists because the thing it moves can be interrupted: `reorder` for a row being dragged, `indicator` for a ground travelling under a selected tab, `control` for a switch handle, plus the toast, the panel and the progress fill. A tween restarts from wherever it was released; a spring settles from arbitrary velocity, which is the whole reason a gesture takes one. Reach for `spring.*` rather than inventing damping at a call site.
- **The skeleton shimmers, and that is the built behaviour** -- `skeleton.tsx` travels a highlight across, on a 1.4s linear loop. The cost is real: a travelling highlight over a full table is thirty elements animating at once, so the question for a *new* loading surface is how many of them there will be, not whether shimmer is allowed.

## The trap that already exists

**A view transition makes every point answer HTML.** If you reach for the View Transitions API, read the note first — it changed what the test harness got back from every probe.

## Where this inverts the usual advice

General UI guidance treats a motion-free interface as unfinished and prescribes entrance animations, staggered lists and scroll reveals. **All three are refused here.** A staggered list is a list the analyst cannot read yet, and this is a screen someone works in rather than looks at. The one place the app spends motion is the unauthenticated field — a surface with no data on it, seen once.
