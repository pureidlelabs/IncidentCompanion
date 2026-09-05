/**
 * The served classification tone as classes: which hue, and whether it fills.
 */

import type { FieldToneSpec } from '@/api/specs'

export type { FieldToneSpec }

/** Filled: something is wrong here. Hollow: nothing is, or it is explained. */
export type ToneFill = FieldToneSpec['fill']

/** The role a value with no served tone draws in. */
export const UNMAPPED_ROLE = 'none'

/**
 * Each role as a filled chip and as a hollow one.
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
 */
export const held = (tone: string, fill: ToneFill): FieldToneSpec => ({ tone, fill })
