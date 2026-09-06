/**
 * The colours an analyst may put on a timeline entry.
 *
 * **Served as a vocabulary, so the picker is a palette rather than the
 * operating system's colour dialog.** A `color` field with no options falls
 * back to `<input type="color">`, which offers 16.7 million values for a
 * column that has to render in three places with different rules: the timeline
 * on two grounds, the graphs, and a Word document that bakes hex and consults
 * no theme. An arbitrary pick satisfies none of them, and nothing measures the
 * contrast of a colour an analyst typed.
 *
 * **Bases first, one per family, then the shades.** The band draws the bases
 * and folds the rest, and it takes the split from this list's own length
 * (`baseCount` is a third of it), so the ordering here is the contract:
 * every family's base, then every family's light, then every family's dark.
 *
 * **Hexes rather than tokens, and that is the report's rule not a shortcut.**
 * A colour on screen and the same colour in a document are two decisions - a
 * document has no theme to consult - so a value stored on a row is baked, and
 * `var(--...)` would reach the timeline and render as nothing in Word.
 *
 * **Nothing under `server/src/report` reads `entry.colour` today**, so the
 * baking is for what a stored hex has to survive rather than for a reader that
 * exists. The severity triple below is deliberately the same three values as
 * `report/document/palette.ts`; when a report does paint from an entry's
 * colour, that is the pairing to check rather than re-derive.
 *
 * Tailwind's 500 / 400 / 700 steps: 500 carries the family on either ground,
 * 400 is the one that stays visible on the dark ground, and 700 is the one
 * that stays visible on white paper.
 */

/** One entry per hue family, in the order the band draws them. */
const BASE = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // amber
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
] as const

/** The lighter step of each family, for the dark ground. */
const LIGHT = [
  '#f87171',
  '#fb923c',
  '#facc15',
  '#4ade80',
  '#60a5fa',
  '#a78bfa',
  '#f472b6',
] as const

/** The darker step of each family, for white paper. */
const DARK = [
  '#b91c1c',
  '#c2410c',
  '#a16207',
  '#15803d',
  '#1d4ed8',
  '#6d28d9',
  '#be185d',
] as const

export const ENTRY_COLOUR = [...BASE, ...LIGHT, ...DARK] as const

/**
 * The colour a severity gives an entry when the analyst has set none.
 *
 * **This is the app's existing colour language, baked.** The screen paints
 * severity as a ramp through tokens, and `report/document/palette.ts` bakes
 * the same three for the document. This names the ramp a third time in the
 * one place a *stored* value can be compared against what an analyst may
 * pick: every value here is one of `ENTRY_COLOUR`, which
 * `entryColour.test.ts` holds, so an automatic colour and an overridden one
 * come from the same set.
 *
 * **`critical` and `high` share red on purpose.** The ramp starts at `high`;
 * `critical` is above the top of it rather than a step of its own, and a
 * seventh hue for it would put two reds on one timeline that mean almost the
 * same thing.
 */
export const SEVERITY_COLOUR: Readonly<Record<string, string>> = {
  critical: '#b91c1c',
  high: '#ef4444',
  medium: '#f97316',
  low: '#eab308',
  informational: '#3b82f6',
}

/**
 * The colour an activity's type gives it.
 *
 * **Off the severity ramp entirely, and that is the point.** An activity is
 * something the SOC *did*; it has no severity, and painting response work in a
 * detection's colours files it under the wrong language.
 *
 * **The three groups are `ui/src/lib/action-class.ts`'s**, which splits the
 * action types into telling someone, fixing something and finding something
 * out, and paints the rail and the badge from that split. This is the same
 * three colours baked, so an entry keeps its class colour on paper.
 */
export const ACTION_TYPE_COLOUR: Readonly<Record<string, string>> = {
  'external notification sent': '#3b82f6',
  'external notification received': '#3b82f6',
  'internal notification': '#3b82f6',
  escalation: '#3b82f6',
  'containment action': '#22c55e',
  'remediation action': '#22c55e',
  'investigation started': '#8b5cf6',
  'ticket created': '#8b5cf6',
  'evidence collected': '#8b5cf6',
  other: '#8b5cf6',
}
