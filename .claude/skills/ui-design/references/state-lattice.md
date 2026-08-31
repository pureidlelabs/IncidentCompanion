# The states a data surface owes

*Load when building or changing a screen that loads, filters or writes. The happy path is the one that gets designed; these are the ones that get discovered in production.*

**Design the unhappy path first.** Starting from "the list is empty and we have to say why" gives the populated row a job to fit into. Starting from the populated row leaves the empty state as whatever is left over, which is how "No data" gets shipped.

## The lattice

| State | What it owes | The mistake |
| --- | --- | --- |
| **Idle** | one obvious primary action | treating an empty form as idle — it is Empty |
| **Loading** | a skeleton with the final layout's geometry | a centred spinner on a blank pane: no shape, so no cue what is coming |
| **Empty** | why it is empty, and the door out of it | "No data", with nothing to press |
| **Error** | the specific cause, and one click back | "Something went wrong" and a dead end |
| **Partial** | what loaded, drawn; what failed, marked in place | blanking the pane because one field failed |
| **Success** | visible confirmation that is not colour alone | a toast gone before the eye reaches it |
| **Conflict** | both versions, and the analyst picks | last write wins, silently — the other analyst's work is gone |
| **Offline** | say so at the shell, hold the writes | pretend it is fine and fail at the next sync |

## What this app already has, and what it does not

Measured on the tree at 2026-08-03:

- **`AsyncBoundary` is used in 30 files** and owns idle → loading → error for every query. `isPending` is first-load-only on purpose, so a refetch never unmounts the table under the analyst. Use it; do not hand-roll the three.
- **`EmptyState` is used in 26 files.** One call signature over shadcn's six `empty` parts.
- **Filtered-empty is its own state and already has a component.** `TimelineNoMatch` names the conflicting filters and offers to drop one side. It exists because *"0 results, clear your filters"* throws away every decision that was fine. A new screen with filters owes the same shape.
- **Partial has no component.** The case API is one door and mostly fails whole, so this has not bitten. It will the moment a screen reads two independent routes — the report screen already reads two listing routes. Mark the failing piece in place; do not blank the pane.
- **Conflict does not exist, and it is the one that is coming.** The app is going multi-user with a claim taken per *row*, which is exactly the surface that generates conflicts, and the whole-case advisory lock that makes the question moot is on its way out.
- **Offline is not a state here.** The app is local-first and binds loopback; the server going away is the app going away. Do not build an offline banner. **This is the ui-craft rule that inverts** — offline handling is a mobile and field-app concern, and this is neither.

## Conflict, when it lands

The accent is already reserved for it. *"The accent is chrome and never data. Presence and conflict take it"* — that is what stops a second analyst's edit reading as a severity.

- Detect on a version or an `updated_at`, not on equality of the payload.
- Show both versions and let the analyst resolve. Never merge silently.
- **Last-write-wins looks like a bug to the analyst who lost**, and in an RCA the lost write is evidence.

## Loading, specifically

- **The skeleton matches the final geometry** — same grid, same rough boxes. A skeleton that does not match is a layout shift when the data lands.
- **After ~200ms, not immediately.** A skeleton that flashes on a local filesystem read looks like a fault. This app reads from disk, so most queries never reach the threshold — which is the argument for the delay, not against it.
- **A button keeps its label while it works.** Swapping the label for a spinner costs the analyst the context of what they pressed, and they click again.

## Errors

- **At the field, not in a toast.** `aria-invalid` plus `aria-describedby`, so the error is announced and not merely red. → `accessibility-floor.md`
- **Name the problem and the fix.** "Password must include a number" beats "Invalid password".
- **Keep what the analyst typed.** A failed write that clears the dialog is the worst outcome on this screen: the analyst was transcribing off an alert.
- **Distinguish refused from broken.** A 403 and a 500 have different doors out, and the registry panes already draw the refusal on `alert.tsx` with a `role`.

## The check

Before a screen is called done, every one of these has been *decided* — some of them decided to be out of scope, which is an answer:

- [ ] Idle has one obvious primary action
- [ ] Loading is a shaped skeleton, not a spinner on nothing
- [ ] Empty says why, and offers the door
- [ ] Filtered-empty names the filters and offers to drop one
- [ ] Error is specific, and what was typed survives it
- [ ] Partial is marked in place if the screen reads more than one route
- [ ] Success is not colour alone
- [ ] Conflict is designed if the row is claimable

**A screen judged only full is a screen whose empty and error copy nobody has read.** The `visual-check` skill captures what is on screen; it does not know which states you never rendered.
