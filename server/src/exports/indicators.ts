/**
 * The case's indicators, consolidated across three tables, in two shapes that
 * are deliberately different in scope: the CSV is an inventory including
 * cleared rows, the STIX bundle only the actionable ones.
 */
import { randomUUID } from 'node:crypto'

import { hashTypeOf } from '../domain/hashes.lists.js'
import { qualified } from '../domain/naming.lists.js'

/** Verdicts meaning "do not act on this". */
const NON_ACTIONABLE = new Set(['benign', 'clean'])


const STIX_HASH_NAME: Record<string, string> = {
  sha256: 'SHA-256',
  sha1: 'SHA-1',
  md5: 'MD5',
}

export interface Indicator {
  readonly type: string
  readonly value: string
  readonly disposition: string
  readonly context: string
  /**
   * Which door the row came through - `manual`, or the importer that wrote it.
   */
  readonly source: string
  readonly blocked: boolean
  /** The case the row belongs to, read off the row rather than the request. */
  readonly caseId: string
}

export interface IndicatorSources {
  readonly networkIndicators: Record<string, unknown>[]
  readonly malware: Record<string, unknown>[]
  readonly cloudApps: Record<string, unknown>[]
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')



/**
 * Every pushable indicator in the case, in table order.
 */
export function collect(sources: IndicatorSources): Indicator[] {
  const found: Indicator[] = []

  for (const row of sources.networkIndicators) {
    // **The row carries its kind.** This looped over an `ip` column and a
    // `domain` column and re-derived the kind from the value's shape, which is
    // the guess `type` exists to replace.
    const value = text(row['value'])
    if (value) {
      found.push({
        type: text(row['type']),
        value,
        disposition: text(row['disposition']),
        context: text(row['context']),
        source: text(row['source']),
        blocked: row['blocked'] === true,
        caseId: text(row['caseId']),
      })
    }
  }

  for (const row of sources.malware) {
    const kind = hashTypeOf(row['hash'])
    if (!kind) continue
    found.push({
      type: kind,
      value: text(row['hash']).toLowerCase(),
      disposition: text(row['verdict']),
      context: text(row['filename']),
      source: text(row['source']),
      blocked: false,
      caseId: text(row['caseId']),
    })
  }

  for (const row of sources.cloudApps) {
    const name = text(row['appName'])
    if (!name) continue
    const instance = text(row['instance'])
    found.push({
      type: 'cloud-app',
      // Two tenants of one application are two rows, so the export has to
      // carry the pair -- the report says it the same way.
      value: qualified(name, instance),
      disposition: text(row['consentType']),
      context: text(row['publisher']),
      source: text(row['source']),
      blocked: false,
      caseId: text(row['caseId']),
    })
  }

  return found
}

/**
 * The CSV's columns, in order. The client writes its own copy of this header in
 * `ui/src/screens/indicator-rows.ts`, and the two are edited together.
 */
export const INDICATOR_CSV_COLUMNS = [
  'type',
  'value',
  'disposition',
  'context',
  'source',
  'blocked',
  'case_id',
] as const

/**
 * The indicators as CSV records, keyed by the header's own spelling.
 */
export function toCsvRows(indicators: Indicator[]): Record<string, unknown>[] {
  return indicators.map((one) => ({
    type: one.type,
    value: one.value,
    disposition: one.disposition,
    context: one.context,
    source: one.source,
    blocked: one.blocked,
    case_id: one.caseId,
  }))
}

/**
 * **An exclusion list, not an inclusion list.**
 */
export function actionable(indicator: Indicator): boolean {
  return !NON_ACTIONABLE.has(indicator.disposition.toLowerCase())
}

/** The STIX pattern for one indicator, or null for a type with no expression. */
function pattern(indicator: Indicator): string | null {
  const escaped = indicator.value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  switch (indicator.type) {
    case 'ipv4':
      return `[ipv4-addr:value = '${escaped}']`
    case 'ipv6':
      return `[ipv6-addr:value = '${escaped}']`
    case 'domain':
      return `[domain-name:value = '${escaped}']`
    case 'url':
      return `[url:value = '${escaped}']`
    case 'md5':
    case 'sha1':
    case 'sha256':
      return `[file:hashes.'${STIX_HASH_NAME[indicator.type]}' = '${escaped}']`
    default:
      // **A cloud app is not expressible as a STIX pattern**, so it is left
      // out of the bundle rather than emitted as an Indicator matching
      // nothing. Everything else reaching here is a kind this switch has not
      // been taught, which is indistinguishable from that deliberate skip --
      // `ipv6` fell through here for as long as the kind existed.
      // `indicators.test.ts` holds the switch against `INDICATOR_TYPE`.
      return null
  }
}

/**
 * A STIX 2.1 bundle of the actionable indicators.
 */
export function toStixBundle(
  indicators: Indicator[],
  options: { now: Date; tlp?: string | undefined; ids?: () => string } = {
    now: new Date(),
  },
): Record<string, unknown> {
  const mint = options.ids ?? randomUUID
  const stamp = options.now.toISOString()

  const objects = indicators.filter(actionable).flatMap((indicator) => {
    const expression = pattern(indicator)
    if (!expression) return []
    return [
      {
        type: 'indicator',
        spec_version: '2.1',
        id: `indicator--${mint()}`,
        created: stamp,
        modified: stamp,
        name: indicator.context || indicator.value,
        pattern: expression,
        pattern_type: 'stix',
        valid_from: stamp,
        ...(options.tlp ? { object_marking_refs: [tlpMarking(options.tlp)] } : {}),
      },
    ]
  })

  return { type: 'bundle', id: `bundle--${mint()}`, objects }
}

/**
 * TLP markings are fixed, specification-assigned ids, never minted.
 */
const TLP_MARKINGS: ReadonlyMap<string, string> = new Map(Object.entries({
  clear: 'marking-definition--94868c89-83c2-464b-929b-a1a8aa3c8487',
  white: 'marking-definition--613f2e26-407d-48c7-9eca-b8e91df99dc9',
  green: 'marking-definition--34098fce-860f-48ae-8e50-ebd3cc5e41da',
  amber: 'marking-definition--f88d31f6-486f-44da-b317-01333bde0b82',
  red: 'marking-definition--5e57c739-391a-4eb3-b6be-7d15ca92d5ed',
}))

export function tlpMarking(tlp: string): string {
  const marking = TLP_MARKINGS.get(tlp.toLowerCase())
  if (!marking) throw new Error(`No TLP marking ${tlp}.`)
  return marking
}

export const TLP_NAMES = [...TLP_MARKINGS.keys()]
