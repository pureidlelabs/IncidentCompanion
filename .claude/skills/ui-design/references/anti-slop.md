# Does this read as designed, or as generated

*Load before finishing a screen. Adapted from the anti-slop catalogue in `educlopez/ui-craft`, cut to what applies to a dense local analyst tool and marked where this app inverts it.*

**The question**: if someone said this screen was generated rather than designed, would you believe them immediately? The tells below are the reasons they would.

## Immediately generated-looking

- **A grid of identical cards** — icon, heading, sentence, repeated 3–6 times. This app has one legitimate card list per pane and the two that exist (Demo cases, Plugins) earn it by carrying prose. Everything else is a table.
- **ALL CAPS on a heading, a button, a nav item or a column header.** The uppercase micro tier labels things and stops there — it is not a way to make prose look technical.
- **Emoji standing in for an icon.** Icons are Lucide, one library, no mixing.
- **A gradient anywhere.** No purple-to-cyan, no gradient text on a number, no blurred colour blobs behind a panel.
- **Glassmorphism, glow as an affordance, a neon accent.** The scrim is dimmed, not blurred, and there is exactly one of it.
- **Bounce or elastic easing.** → `motion.md`

## Noticed by anyone who designs

- **A coloured pill around a number that changed.** Plain secondary text.
- **A thick coloured left border on a card** to signal a state. Use the ground or the badge, both of which already carry the severity ramp.
- **The same corner radius on everything.** The kit's radius is 8px and the picker's own rail shipped 4px — which is how that duplicate was found.
- **`transition: all`.** Name the properties. → `motion.md`
- **A vertical bar chart for a time series.** Area or line. Horizontal bars are fine for categorical.
- **A pie chart.** The graph tier is a node-link graph and a timeline; nothing here is a proportion worth a wedge.
- **Walls of text in the interface.** A control needing a sentence to explain why it works that way is the wrong control.
- **A generic label** — "Submit", "Learn more", "Click here". Name the action, not the mechanism.
- **Em dashes flooding a UI string.** Three or more in visible copy is prose grammar leaking into interface grammar. Restructure.
- **A section wrapped in a rounded card because no layout decision was made.** Cards are for peer items in a collection. The pane scrolls; it is not a stack of cards.

## Polish, and it is what separates good from adequate

- **`tabular-nums` on every column of figures**, or the digits jitter as rows change.
- **`text-wrap: balance`** on a heading that wraps.
- **Curly quotes in prose**, straight quotes only inside `--text-data`.
- **A number with no adjacent context.** A count nobody can act on is the dashboard rule in miniature.

## Where this app inverts the catalogue

These are upstream rules that are wrong here. Do not "fix" toward them.

| Upstream says | Here |
| --- | --- |
| 90% neutral, one accent, never default to blue | Correct on chrome — but **severity is a four-step ramp and activities have three more hues**, and those are data, not decoration. The accent stays off data entirely. |
| Sections breathe: 80–160px between majors | **No.** This is a working surface. Density is the requirement; the table row is 32px on purpose. |
| Generous whitespace, 1–2 items per row | Applies to what you *read* (the timeline row got taller), never to what you *scan*. |
| Build a dashboard with metric cards and sparklines | **There is no dashboard**, by rule. |
| Touch targets ≥ 44px | **24px floor.** Desktop tool, mouse and keyboard. → `accessibility-floor.md` |
| One signature detail, a layout break, an experimental composition | **No.** Every screen copies the timeline. A screen with its own character is the duplicate-block defect wearing a compliment. |
| Design an offline state | Local-first, loopback only. The server going away is the app going away. → `state-lattice.md` |
| Landing-page, hero and marketing guidance | There is no marketing surface in this repo. |

## The one that matters most here

**A screen that looks right on its own is the failure mode**, not the success one. Three expanded-row designs and three filter rows all looked correct individually and were found only by putting two side by side. Before shipping, open the timeline next to what you built.
