import { hashTypeOf } from '@contract/hashes.lists'

import type { Case } from '@/api/model'

/**
 * The indicator export's model: what the case would hand to a blocklist, a TIP
 * or a detection stack, and which of those rows are worth pushing.
 */

/**
 * One row of the bundle.
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
 */
export const NON_ACTIONABLE: ReadonlySet<string> = new Set(['benign', 'clean'])

/**
 * Whether this row is worth pushing.
 */
export function isActionable(row: Indicator): boolean {
  const disposition = row.disposition.trim().toLowerCase()
  return disposition !== '' && !NON_ACTIONABLE.has(disposition)
}

/**
 * Every pushable indicator in the case, in table order.
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

/** How many rows are worth pushing. */
export function actionableCount(rows: readonly Indicator[]): number {
  return rows.filter(isActionable).length
}

/**
 * True only when the case has indicators and none of them are actionable: the
 * bundle would leave with no objects in it.
 */
export function nothingToPush(rows: readonly Indicator[]): boolean {
  return rows.length > 0 && actionableCount(rows) === 0
}

/**
 * Whether an indicator matches what is typed in the toolbar's search box.
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
