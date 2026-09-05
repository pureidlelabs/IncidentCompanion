/**
 * What the timeline dialog folds away.
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
 */
export function expectedFields(tactic: string | undefined): readonly string[] {
  const links = (tactic && TACTIC_LINKS[tactic]) ?? DEFAULT_TACTIC_LINKS
  return [...EVENT_CORE, ...EVENT_ALWAYS_CLEAR, ...links]
}

/**
 * **Only an event has expectations.**
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
