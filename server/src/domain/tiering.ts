/**
 * What the timeline dialog folds away.
 *
 * **Measurements, not preferences**, which is why these are constants rather
 * than something computed from the open case - derived from the case being
 * edited, the dialog would reshape itself as the analyst typed into it.
 *
 * **Named snake_case**, because `/api/specs` serves these constants as they
 * are and the client reads that document raw.
 */

/** Never folded: the five a line is not a line without. */
export const EVENT_CORE = ['description', 'time', 'tactic', 'severity', 'event_source'] as const

/**
 * The three that clear 80% under *every* measured tactic - 100% each across
 * the 102 - so they are never the thing to hide.
 */
export const EVENT_ALWAYS_CLEAR = ['technique', 'confidence', 'source_tool'] as const

/** tactic -> the reference fields its entries actually carry, in dialog order. */
export const TACTIC_LINKS: Record<string, readonly string[]> = {
  'command and control': ['system_id', 'network_indicator_ids'],
  impact: ['system_id', 'malware_ids'],
  'lateral movement': ['source_system_id', 'system_id', 'account_ids', 'malware_ids'],
  exfiltration: ['system_id', 'account_ids', 'network_indicator_ids'],
  'initial access': ['system_id', 'account_ids'],
  collection: ['system_id', 'account_ids'],
  execution: ['system_id', 'account_ids'],
  'credential access': ['system_id', 'account_ids'],
  'defense evasion': ['system_id', 'account_ids'],
  discovery: ['system_id', 'account_ids'],
}

/**
 * The links for a tactic the table does not name, and for the unset tactic a
 * freshly captured line carries - never an empty list.
 */
export const DEFAULT_TACTIC_LINKS = ['system_id', 'account_ids'] as const

/**
 * The fields an event of this tactic is expected to carry.
 *
 * **Here as well as in the client, and not a duplicated rule**: the rail's
 * attention chip needs a count, the client needs the answer per field on the
 * row being edited. Both read the same `TACTIC_LINKS`, the client through
 * `/api/specs`, so the vocabulary cannot drift.
 */
export function expectedFields(tactic: string | undefined): readonly string[] {
  const links = (tactic && TACTIC_LINKS[tactic]) ?? DEFAULT_TACTIC_LINKS
  return [...EVENT_CORE, ...EVENT_ALWAYS_CLEAR, ...links]
}

/**
 * **Only an event has expectations.** An action is a thing somebody did and has
 * no tactic to look up, so it is never gapped - counting it would put a number
 * on the rail that no screen can explain.
 */
export function isGapped(row: {
  kind?: string | null
  tactic?: string | null
  timeAssumed?: boolean | null
  [field: string]: unknown
}): boolean {
  if ((row['kind'] ?? 'event') !== 'event') return false
  return expectedFields(row['tactic'] as string | undefined).some((name) => {
    // `time` is always present on a row; what makes it missing is that it was
    // inferred rather than recorded, which is a different column.
    if (name === 'time') return Boolean(row['timeAssumed'])
    const value = row[camel(name)] ?? row[name]
    return Array.isArray(value) ? value.length === 0 : !value
  })
}

/** The tiering names fields on the wire (`system_id`); a row holds them camel. */
function camel(name: string): string {
  return name.replace(/_([a-z])/g, (_m, letter: string) => letter.toUpperCase())
}

/**
 * The closed set of kinds a form field can be.
 *
 * **The form renderer's `switch` ends in a `default` that builds a text
 * input**, so a misspelled kind renders as a plain box rather than failing. A
 * client validating against this list is what catches it.
 *
 * **This list and `FieldKind` in `field-spec.ts` are two declarations of one
 * closed set.** A kind added to the union alone typechecks, serves, and draws
 * as a text box. `specs.controller.test.ts` asserts no served field carries a
 * kind absent from here, which is the property rather than the pair.
 */
export const FIELD_KINDS = [
  'autocomplete',
  'checkbox',
  'color',
  'device_select',
  'event_datetime',
  'multi_device_select',
  'number',
  'select',
  'tag_select',
  'text',
  'textarea',
] as const
