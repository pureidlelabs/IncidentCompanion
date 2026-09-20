/*
 * The regulatory regimes this install surfaces, and what a screen calls each.
 *
 * **Separate from `compliance.ts`, which holds the taxonomies these regimes are
 * made of.** A label here is product copy; a value there is a regulatory claim
 * read straight off published text.
 */

/** Ordered as a screen offers them. `as const`, so `z.enum` infers the union. */
export const REGIME_KEYS = ['gdpr', 'nis2', 'dora'] as const

export type RegimeKey = (typeof REGIME_KEYS)[number]

export const REGIME_LABEL: Record<RegimeKey, string> = {
  gdpr: 'GDPR',
  nis2: 'NIS2',
  dora: 'DORA',
}

export const REGIMES: readonly { key: RegimeKey; label: string }[] = REGIME_KEYS.map((key) => ({
  key,
  label: REGIME_LABEL[key],
}))
