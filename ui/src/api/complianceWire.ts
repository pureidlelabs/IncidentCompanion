/**
 * The Compliance screen's controls speak strings; the record does not.
 */
import type { ComplianceFieldSpec } from './specs'

/** What a control renders and emits. */
export type ComplianceValue = string | number | boolean

/** The joined-string form of whatever the record holds for this field. */
export function valueFor(
  record: Readonly<Record<string, unknown>>,
  spec: ComplianceFieldSpec,
): ComplianceValue {
  const raw = record[spec.name]
  if (raw === null || raw === undefined) return spec.kind === 'check' ? false : ''
  if (Array.isArray(raw)) return raw.join(spec.join === '\n' ? '\n' : ',')
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return raw
  return ''
}

/**
 * What to PATCH for this field.
 */
export function wireValue(spec: ComplianceFieldSpec, value: ComplianceValue): unknown {
  if (spec.kind === 'check') return Boolean(value)

  if (spec.kind === 'multi_csv' || spec.kind === 'multi_lines') {
    const separator = spec.join === '\n' ? '\n' : ','
    return String(value)
      .split(separator)
      .map((one) => one.trim())
      .filter((one) => one !== '')
  }

  if (spec.kind === 'number') {
    const text = String(value).trim()
    if (text === '') return null
    const parsed = Number(text)
    return Number.isFinite(parsed) ? parsed : null
  }

  const text = String(value)
  // A ground or a select says "not answered" with null; free text keeps its
  // empty string, because a cleared note is a cleared note rather than an
  // unasked question.
  if (text === '' && spec.kind !== 'text') return null
  return text
}
