/**
 * The Compliance screen's controls speak strings; the record does not.
 *
 * **One boundary, both directions, and it is this file.** `ComplianceField`
 * renders and emits a joined string for every kind - that is what `join` on the
 * descriptor is *for*, and what lets one control serve a 27-member picker and a
 * yes/no ground. The record stores a `jsonb` array for the sets, a nullable
 * integer for the counts and `null` for a question nobody has answered. Doing
 * the conversion at each call site is how one of the six kinds ends up sending
 * `"AT,BE"` to a column expecting an array, which is a 400 the screen has no
 * way to explain.
 *
 * **`''` becomes `null`, never the empty string.** Python spells "not stated"
 * as a leading `''` inside each vocabulary; here the absence of an answer is
 * null, and a stored `''` would be a second spelling for it - the one that
 * survives into a report as though somebody had answered.
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
 *
 * **A count of zero is a value and stays one.** `Number('')` is `0`, so an
 * emptied count field would be saved as "nobody was affected" rather than as
 * unanswered - the check is on the text, before the conversion.
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
