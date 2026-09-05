/**
 * ENISA's personal-data-breach severity score, and the bands GDPR reads off it.
 */
import {
  GDPR_CIRCUMSTANCES,
  GDPR_DATA_CONTEXTS,
  GDPR_IDENTIFIABILITY,
  GDPR_SEVERITY_BANDS,
} from '../domain/vocabularies/compliance.js'

const weights = (list: readonly { value: string; weight: number; label: string }[]) =>
  new Map(list.map((one) => [one.value, one]))

const CONTEXTS = weights(GDPR_DATA_CONTEXTS)
const IDENTIFIABILITY = weights(GDPR_IDENTIFIABILITY)
const CIRCUMSTANCES = weights(GDPR_CIRCUMSTANCES)

/**
 * The four bands as exclusive upper bounds - ENISA's own cut points.
 */
const BANDS: readonly [number, string][] = [
  [2.0, 'low'],
  [3.0, 'medium'],
  [4.0, 'high'],
  [Infinity, 'very high'],
]

/**
 * The analyst's adjustment to the base context score, in ENISA's own steps.
 */
export const MAX_CONTEXT_ADJUSTMENT = 1.0

export interface SeverityScore {
  score: number
  band: string
  dpc: number
  ei: number
  cb: number
  context: string
  identifiability: string
  circumstances: string[]
  adjustment: number
  /** The arithmetic, for the line under the band. */
  formula: string
}

const trim = (n: number) => Number(n.toFixed(4))

/**
 * The band a score falls in.
 */
export function severityBand(score: number): string {
  for (const [upper, name] of BANDS) if (score < upper) return name
  return GDPR_SEVERITY_BANDS[GDPR_SEVERITY_BANDS.length - 1]!
}

/**
 * Whether `band` is `floor` or worse, by position rather than by name.
 */
export function atLeastBand(band: string, floor: string): boolean {
  return GDPR_SEVERITY_BANDS.indexOf(band as never) >= GDPR_SEVERITY_BANDS.indexOf(floor as never)
}

/**
 * Whether the two required factors are stated.
 */
export function scoreable(
  context: string | null | undefined,
  identifiability: string | null | undefined,
): boolean {
  return CONTEXTS.has(context ?? '') && IDENTIFIABILITY.has(identifiability ?? '')
}

/**
 * Score a breach from its three ENISA factors.
 */
export function severityScore(
  context: string,
  identifiability: string,
  circumstances: readonly string[] = [],
  adjustment = 0,
): SeverityScore {
  const base = CONTEXTS.get(context)
  if (!base) throw new Error(`unknown data context: ${context}`)
  const ease = IDENTIFIABILITY.get(identifiability)
  if (!ease) throw new Error(`unknown identifiability: ${identifiability}`)

  // Deduplicated: the same circumstance named twice is a UI slip, and summing
  // it twice moves the band.
  const chosen = [...new Set(circumstances)]
  const unknown = chosen.filter((one) => !CIRCUMSTANCES.has(one))
  if (unknown.length) throw new Error(`unknown breach circumstances: ${unknown.join(', ')}`)

  const bounded = Math.max(-MAX_CONTEXT_ADJUSTMENT, Math.min(MAX_CONTEXT_ADJUSTMENT, adjustment))
  // Floored at ENISA's own lowest base rather than at zero: a zero or negative
  // DPC multiplies the whole score away, so a heavily adjusted sensitive-data
  // breach could score below a simple-data one.
  const dpc = Math.max(base.weight + bounded, 1.0)
  const ei = ease.weight
  const cb = chosen.reduce((sum, one) => sum + CIRCUMSTANCES.get(one)!.weight, 0)
  const score = trim(dpc * ei + cb)

  return {
    score,
    band: severityBand(score),
    dpc,
    ei,
    cb,
    context,
    identifiability,
    circumstances: chosen,
    adjustment: bounded,
    formula: `SE = ${dpc} \u00d7 ${ei} + ${cb} = ${score}`,
  }
}

/** The published label for a factor, for a breakdown line. */
export function labelFor(kind: 'context' | 'identifiability', value: string): string {
  const table = kind === 'context' ? CONTEXTS : IDENTIFIABILITY
  return table.get(value)?.label ?? value
}
