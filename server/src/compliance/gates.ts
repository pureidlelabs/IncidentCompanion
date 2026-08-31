/**
 * The determination engine: criteria combined into a verdict that shows its
 * work. A lens states *what* its criteria are and never how to combine them -
 * that is AND, OR or "at least N of these", here.
 *
 * **Unknown is not false.** A criterion the case cannot answer yet is
 * `met: null`, which leaves the gate undetermined; silence must never read as
 * a negative finding. A determination always carries its breakdown.
 */

/** One testable limb of a regime's test. */
export interface Criterion {
  key: string
  label: string
  /** Three-valued. `null` is "the case does not say yet". */
  met: boolean | null
  /** The citation the analyst files behind. */
  article: string
  /** The measured value that decided it - "515 minutes against 120". */
  detail: string
}

export interface Determination {
  met: boolean | null
  criteria: Criterion[]
  /** The rule that combined them, for the line above the breakdown. */
  rule: string
}

export function criterion(
  key: string,
  label: string,
  met: boolean | null,
  article = '',
  detail = '',
): Criterion {
  return { key, label, met, article, detail }
}

/**
 * The criteria that actually carried the verdict.
 *
 * For a satisfied OR the limbs that fired, for a failed AND the ones that did
 * not. Rendering every criterion under a verdict buries the reason among a
 * dozen inapplicable lines.
 */
export function deciding(determination: Determination): Criterion[] {
  const { met, criteria } = determination
  return criteria.filter((one) => one.met === met)
}

export function unanswered(determination: Determination): Criterion[] {
  return determination.criteria.filter((one) => one.met === null)
}

/**
 * Every criterion must be met.
 *
 * One definite false settles it whatever else is unknown - waiting for the
 * rest would ask the analyst for fields that cannot change the answer.
 */
export function allOf(criteria: Criterion[], rule = ''): Determination {
  if (criteria.some((one) => one.met === false)) return { met: false, criteria, rule }
  if (criteria.some((one) => one.met === null)) return { met: null, criteria, rule }
  return { met: true, criteria, rule }
}

/**
 * At least one - the mirror of `allOf`.
 *
 * One definite true settles it: NIS2 Article 23(3) is a list of grounds and
 * meeting one is the whole test, so an unanswered second ground is not a gap.
 */
export function anyOf(criteria: Criterion[], rule = ''): Determination {
  if (criteria.some((one) => one.met === true)) return { met: true, criteria, rule }
  if (criteria.some((one) => one.met === null)) return { met: null, criteria, rule }
  return { met: false, criteria, rule }
}

/**
 * At least `n` met - DORA's "two or more of the Article 9 thresholds".
 *
 * **Settles early in both directions.** Once `n` are met the rest cannot change
 * it; once too few *can* be met - the met plus the still-unknown fall short -
 * it is a definite no rather than a permanent "waiting for data". Counting only
 * the definite trues and calling the remainder a no is the version that files a
 * major incident as ordinary because two thresholds were never filled in.
 */
export function atLeast(n: number, criteria: Criterion[], rule = ''): Determination {
  const met = criteria.filter((one) => one.met === true).length
  const possible = met + criteria.filter((one) => one.met === null).length
  if (met >= n) return { met: true, criteria, rule }
  if (possible < n) return { met: false, criteria, rule }
  return { met: null, criteria, rule }
}

/**
 * AND over whole determinations - a two-part gate like DORA's Article 8.
 *
 * Flattens the parts' criteria into one breakdown: the analyst reads one list
 * of what decided it, not a tree they have to walk.
 */
export function gate(parts: Determination[], rule = ''): Determination {
  const criteria = parts.flatMap((part) => part.criteria)
  if (parts.some((part) => part.met === false)) return { met: false, criteria, rule }
  if (parts.some((part) => part.met === null)) return { met: null, criteria, rule }
  return { met: true, criteria, rule }
}

/**
 * A "does this figure pass the published limit" criterion.
 *
 * **Strictly greater.** Every significance threshold in the Implementing
 * Regulation is worded "more than" or "exceeds", so a figure landing exactly on
 * the published number does not meet the limb.
 *
 * **`null` is unstated and `0` is a measurement**, which is the one place this
 * engine deliberately departs from Python - see the header. A downtime of zero
 * minutes is an incident caught before it bit, and answering the threshold with
 * it is correct.
 */
export function threshold(
  key: string,
  label: string,
  value: number | null | undefined,
  limit: number,
  options: { article?: string; unit?: string } = {},
): Criterion {
  const { article = '', unit = '' } = options
  if (value === null || value === undefined) {
    return criterion(key, label, null, article, 'not stated')
  }
  const suffix = unit ? ` ${unit}` : ''
  const shown = (n: number) => n.toLocaleString('en-GB').replace(/,/g, ' ')
  return criterion(
    key,
    label,
    value > limit,
    article,
    `${shown(value)}${suffix} against ${shown(limit)}${suffix}`,
  )
}

/** A ground the analyst answered yes / no / not yet. */
export function ground(
  key: string,
  label: string,
  answer: string | null | undefined,
  article = '',
): Criterion {
  if (answer === 'yes') return criterion(key, label, true, article, 'stated')
  if (answer === 'no') return criterion(key, label, false, article, 'stated')
  return criterion(key, label, null, article, 'not stated')
}
