/**
 * Sentinel's severity word against this product's vocabulary.
 *
 * **Narrower than `SEVERITY`**: the vocabulary has `critical` and Sentinel's
 * scale stops at `High`, so a word above the ladder is unmapped rather than
 * guessed at. What an unmapped word becomes is the caller's to decide.
 */
import { SEVERITY } from '../../../domain/vocabularies.lists.js'

export type Severity = (typeof SEVERITY)[number]

const FROM_PROVIDER: ReadonlyMap<string, Severity> = new Map<string, Severity>([
  ['high', 'high'],
  ['medium', 'medium'],
  ['low', 'low'],
  ['informational', 'informational'],
])

/** The level this word names, or null when the vocabulary cannot say it. */
export function severityOf(reported: unknown): Severity | null {
  if (typeof reported !== 'string') return null
  return FROM_PROVIDER.get(reported.trim().toLowerCase()) ?? null
}

/**
 * What a payload of incidents marks the case it opens, or null for unmarked.
 *
 * The worst any of them reported, walking `SEVERITY` from its worst end, so
 * the ladder is the vocabulary's own rather than a second list here.
 */
export function caseSeverityOf(
  incidents: readonly { readonly severity?: unknown }[],
): Severity | null {
  return (
    SEVERITY.find((level) => incidents.some((one) => severityOf(one.severity) === level)) ?? null
  )
}
