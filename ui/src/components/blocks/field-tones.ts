/**
 * The served classification tone as classes: which hue, and whether it fills.
 *
 * Holds no component and imports no kit, so `severity-badge.tsx` and
 * `severity-badge.tsx` paint one classification the same way -- the same
 * split `severity-tones.ts` makes for the severity ramp.
 *
 * **The server owns the vocabulary and this owns the paint.** A classification
 * value added on the server needs no change here; a *hue* added on the server
 * needs one entry in `ROLE_PAINT` and one token declaration, and nothing else.
 * Until it has one it draws grey, which is the same answer an unmapped value
 * gets.
 */

import type { FieldToneSpec } from '@/api/specs'

export type { FieldToneSpec }

/** Filled: something is wrong here. Hollow: nothing is, or it is explained. */
export type ToneFill = FieldToneSpec['fill']

/** The role a value with no served tone draws in. */
export const UNMAPPED_ROLE = 'none'

/**
 * Each role as a filled chip and as a hollow one.
 *
 * **Measured per ground, because a chip is type on a fill and a hollow chip is
 * type on the page.** The floor is 4.5:1 for the lettering either way, and the
 * two numbers below that are not the ramp's own token are why:
 *
 * - **`critical` fills from `--severity-critical-type`, not the ramp.** The
 *   ramp's dark red carries `--on-severity` at **3.76:1**, under the floor;
 *   `-type` reads 5.38:1 light and 5.56:1 dark. This is the same reason the
 *   marker dot in `severity-tones.ts` already fills from `-type`.
 * - **`low` letters from `--severity-low-type` when hollow.** The ramp's
 *   yellow is 1.81:1 as type on the light page.
 *
 * A hollow chip letters and borders in *one* token so the outline cannot pass
 * while the word fails.
 */
export const ROLE_PAINT: Record<string, { solid: string; hollow: string }> = {
  critical: {
    solid: 'bg-severity-critical-type text-on-severity',
    hollow: 'border-severity-critical-type text-severity-critical-type',
  },
  high: {
    solid: 'bg-severity-high text-on-severity',
    hollow: 'border-severity-high text-severity-high',
  },
  medium: {
    solid: 'bg-severity-medium text-on-severity',
    hollow: 'border-severity-medium text-severity-medium',
  },
  low: {
    solid: 'bg-severity-low text-on-severity-low',
    hollow: 'border-severity-low-type text-severity-low-type',
  },
  contain: {
    solid: 'bg-action-contain text-on-severity',
    hollow: 'border-action-contain text-action-contain',
  },
  investigate: {
    solid: 'bg-action-investigate text-on-severity',
    hollow: 'border-action-investigate text-action-investigate',
  },
  info: {
    solid: 'bg-severity-info text-on-severity',
    hollow: 'border-severity-info text-severity-info',
  },
  none: {
    solid: 'bg-severity-none text-on-severity',
    hollow: 'border-severity-none text-severity-none',
  },
}

/**
 * A role as lettering, for a value drawn as a coloured word rather than a chip.
 *
 * **The hollow chip's own token**, so a word and a chip of one role can never
 * be two colours -- which is the whole reason the classification ramp is one
 * table rather than one per surface.
 */
export const ROLE_INK: Record<string, string> = Object.fromEntries(
  Object.entries(ROLE_PAINT).map(([role, paint]) => [
    role,
    /\btext-[a-z0-9-]+/.exec(paint.hollow)?.[0] ?? 'text-severity-none',
  ]),
)

/** How a chip is painted: the role it resolved to, its fill, and the classes. */
export interface FieldTonePaint {
  role: string
  fill: ToneFill
  className: string
}

/**
 * The classes for a served tone.
 *
 * **Takes the value defensively.** `field_tones` is served, so anything can
 * arrive: a role this build has no token for, a `fill` that is neither word, a
 * value the row does not carry yet. Every one of those resolves to the grey
 * hollow chip rather than to an unstyled span -- an unpainted `Badge` is the
 * one outcome that reads as a rendering failure instead of as "unrated".
 *
 * Grey means nobody judged this. It is what a value outside the served map
 * gets, and what a role this client cannot paint gets, and the two are one
 * colour on screen by design.
 */
export function paintFor(tone: FieldToneSpec | undefined): FieldTonePaint {
  const role = tone?.tone
  // `Object.hasOwn`, not a truthiness check on the lookup: `constructor` reads
  // back a function off the prototype and paints the chip with `[object ...]`.
  const known =
    typeof role === 'string' && Object.hasOwn(ROLE_PAINT, role) ? role : UNMAPPED_ROLE
  const fill: ToneFill = tone?.fill === 'solid' ? 'solid' : 'hollow'
  // `?? ''` is unreachable while `none` is in the table, and is what stops a
  // deleted `none` entry rendering `undefined` into the class string.
  return { role: known, fill, className: ROLE_PAINT[known]?.[fill] ?? '' }
}

/**
 * A tone a call site holds itself, for a state the server does not classify.
 *
 * Kill chain coverage, an evidence state and a report's lifecycle are not
 * classifications and have no served tone -- they name one here. Both axes are
 * spelled out at the call site's expense rather than defaulted, because a
 * defaulted `fill` is the axis silently going flat.
 */
export const held = (tone: string, fill: ToneFill): FieldToneSpec => ({ tone, fill })
