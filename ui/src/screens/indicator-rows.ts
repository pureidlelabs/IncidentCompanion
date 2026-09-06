import { hashTypeOf } from '@contract/hashes.lists'

import type { Case } from '@/api/model'

/**
 * The indicator export's model: what the case would hand to a blocklist, a TIP
 * or a detection stack, and which of those rows are worth pushing.
 *
 * The serialisers stay server-side. This repeats the aggregation
 * `server/src/exports/indicators.ts` performs so a screen can show what a
 * download would carry, and never re-derives its bytes.
 *
 * Its own module rather than the screen's, so the derivation can be tested
 * without rendering a table.
 */

/**
 * One row of the bundle.
 *
 * `id` is the case row this came from, which is what a table needs as a key.
 * It is not the indicator's identity: two rows can carry the same value.
 */
export interface Indicator {
  id: string
  type: string
  value: string
  disposition: string
  context: string
  source: string
  blocked: boolean
}

/**
 * Dispositions meaning "do not act on this".
 *
 * An exclusion list, so a vocabulary value nobody has classified yet is
 * counted rather than silently dropped.
 */
export const NON_ACTIONABLE: ReadonlySet<string> = new Set(['benign', 'clean'])

/**
 * Whether this row is worth pushing.
 *
 * **A blank disposition is not actionable, and reading it as one made the two
 * numbers on the screen identical.** Cloud apps are collected with no
 * disposition at all - the export route reads a consent type as one and this
 * screen does not - so with `''` counted in, every case carrying a cloud app
 * reported every indicator as pushable and the empty-bundle warning could not
 * fire. An unclassified row is a row somebody has not decided about, which is
 * the opposite of one they decided to act on.
 */
export function isActionable(row: Indicator): boolean {
  const disposition = row.disposition.trim().toLowerCase()
  return disposition !== '' && !NON_ACTIONABLE.has(disposition)
}

/**
 * Every pushable indicator in the case, in table order.
 *
 * One network row is one entry: the row carries its own type, where two columns
 * once let it be an address and a domain at once. A malware row whose hash is
 * not a recognised digest length is skipped rather than shown blank.
 */
export function collectIndicators(kase: Case): Indicator[] {
  const found: Indicator[] = []
  for (const item of kase.networkIndicators) {
    const value = item.value.trim()
    if (!value) continue
    found.push({
      id: item.id,
      type: item.type,
      value,
      disposition: item.disposition,
      context: item.context,
      source: item.source,
      blocked: item.blocked,
    })
  }
  for (const item of kase.malware) {
    const type = hashTypeOf(item.hash)
    if (!type) continue
    found.push({
      id: item.id,
      type,
      value: item.hash.trim().toLowerCase(),
      disposition: item.verdict,
      context: item.filename,
      source: item.source,
      blocked: false,
    })
  }
  for (const item of kase.cloudApps) {
    if (!item.appName.trim()) continue
    found.push({
      id: item.id,
      type: 'cloud-app',
      value: item.appName.trim(),
      disposition: '',
      context: item.publisher,
      source: item.source,
      blocked: false,
    })
  }
  return found
}

export function actionableCount(rows: readonly Indicator[]): number {
  return rows.filter(isActionable).length
}

/**
 * True only when the case has indicators and none of them are actionable: the
 * bundle would leave with no objects in it.
 *
 * A case with no indicators at all returns false - it has nothing to warn
 * about either way.
 */
export function nothingToPush(rows: readonly Indicator[]): boolean {
  return rows.length > 0 && actionableCount(rows) === 0
}

/**
 * Whether an indicator matches what is typed in the toolbar's search box.
 *
 * **The Value column and nothing else.** The badge reads `Indicator`, and the
 * table has no such column: the row *is* the indicator, and the column carrying
 * it is `Value`. The type, the disposition, the context and the source beside
 * it are their own columns and are not searched. AND across whitespace-separated
 * terms, so a second word narrows rather than widens; a blank query matches
 * every row.
 */
export function matchesIndicator(row: Indicator, query: string): boolean {
  const hay = row.value.toLowerCase()
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word))
}

/**
 * The rows as CSV, marking line included.
 *
 * **The marking is a comment line above the header, not a column.** It applies
 * to the file rather than to any one row, and a column repeating `TLP:AMBER`
 * on every line is the same claim made once per indicator.
 *
 * Quoting is unconditional: a `context` holding a comma is the ordinary case,
 * and a quote-when-needed rule is one branch nobody reads until it is wrong.
 */
export function indicatorsCsv(rows: readonly Indicator[], tlp: string): string {
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`
  const lines: string[] = []
  if (tlp) lines.push(`# TLP:${tlp.toUpperCase()}`)
  lines.push(['type', 'value', 'disposition', 'context', 'source', 'blocked'].join(','))
  for (const row of rows) {
    lines.push(
      [
        cell(row.type),
        cell(row.value),
        cell(row.disposition),
        cell(row.context),
        cell(row.source),
        row.blocked ? 'true' : 'false',
      ].join(','),
    )
  }
  return `${lines.join('\n')}\n`
}

/** The STIX 2.1 pattern for one indicator, or `''` for a type with none. */
function patternFor(row: Indicator): string {
  // The backslash first, or the one added for a quote is escaped again.
  const escaped = row.value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  switch (row.type) {
    case 'ipv4':
      return `[ipv4-addr:value = '${escaped}']`
    case 'ipv6':
      return `[ipv6-addr:value = '${escaped}']`
    case 'domain':
      return `[domain-name:value = '${escaped}']`
    case 'url':
      return `[url:value = '${escaped}']`
    case 'sha256':
      return `[file:hashes.'SHA-256' = '${escaped}']`
    case 'sha1':
      return `[file:hashes.'SHA-1' = '${escaped}']`
    case 'md5':
      return `[file:hashes.MD5 = '${escaped}']`
    case 'email':
      return `[email-addr:value = '${escaped}']`
    default:
      return ''
  }
}

/**
 * The rows as a STIX 2.1 bundle.
 *
 * The marking is a `marking-definition` the indicators reference, which is
 * what a consumer reads; a TLP written into each description is a sentence
 * rather than a claim a tool can act on.
 *
 * A row whose type has no pattern is left out rather than emitted with an
 * empty one: a bundle a consumer refuses is worse than a shorter bundle.
 */
export function indicatorsStix(rows: readonly Indicator[], tlp: string): string {
  const marking = tlp
    ? {
        type: 'marking-definition',
        spec_version: '2.1',
        id: `marking-definition--${tlp.toLowerCase()}`,
        definition_type: 'tlp',
        name: `TLP:${tlp.toUpperCase()}`,
      }
    : undefined
  const objects = rows
    .map((row) => ({ row, pattern: patternFor(row) }))
    .filter(({ pattern }) => pattern !== '')
    .map(({ row, pattern }) => ({
      type: 'indicator',
      spec_version: '2.1',
      id: `indicator--${row.id}`,
      name: row.value,
      description: row.context,
      pattern,
      pattern_type: 'stix',
      ...(marking ? { object_marking_refs: [marking.id] } : {}),
    }))
  return `${JSON.stringify({ type: 'bundle', id: 'bundle--indicators', objects: [...(marking ? [marking] : []), ...objects] }, null, 2)}\n`
}
