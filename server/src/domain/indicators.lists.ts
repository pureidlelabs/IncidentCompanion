/**
 * What a case's indicators are, and what a feed of them carries.
 *
 * **One home, because two doors publish them.** The export route serves the
 * whole case and the Indicators screen serves the rows an analyst has filtered
 * to, and the difference worth keeping is which rows each includes -- not what
 * a row is, which columns a file has, or what a bundle looks like. Each of
 * those was written twice and the copies disagreed about seven things.
 *
 * Reachable from the browser through `@contract/indicators.lists`.
 */
import { hashTypeOf } from './hashes.lists.js'
import { qualified } from './naming.lists.js'
import { tlpMarking, tlpMarkingObjects } from './tlp.lists.js'

/** One indicator, consolidated from whichever table it came out of. */
export interface Indicator {
  /**
   * The case row this came from. A table needs it as a key; it is not the
   * indicator's identity, because two rows can carry the same value.
   */
  readonly id: string
  readonly type: string
  readonly value: string
  readonly disposition: string
  readonly context: string
  /**
   * Which door the row came through - `manual`, or the importer that wrote it.
   * Not a second spelling of `context`, which is the analyst's own note on a
   * network row, the filename on a malware row and the publisher on an app.
   */
  readonly source: string
  readonly blocked: boolean
  readonly caseId: string
}

export interface IndicatorSources {
  readonly networkIndicators: readonly Record<string, unknown>[]
  readonly malware: readonly Record<string, unknown>[]
  readonly cloudApps: readonly Record<string, unknown>[]
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * Dispositions meaning "do not act on this".
 *
 * **An exclusion list, not an inclusion list.** A vocabulary value nobody
 * anticipated defaults to being exported: a missed indicator is worse than an
 * extra one, and an inclusion list silently drops every new verdict.
 */
export const NON_ACTIONABLE: ReadonlySet<string> = new Set(['benign', 'clean'])

/**
 * Every indicator in the case, in table order.
 *
 * `inCase` is used only where a row carries no `caseId` of its own. The route
 * reads whole rows and each states which case it belongs to; the browser holds
 * rows whose envelope carries only their version, and the case it is showing.
 */
export function collect(sources: IndicatorSources, inCase = ''): Indicator[] {
  const found: Indicator[] = []
  const caseOf = (row: Record<string, unknown>) => text(row['caseId']) || inCase

  for (const row of sources.networkIndicators) {
    // **The row carries its kind.** `type` is the column that says what the
    // value is, and re-deriving the kind from the value's shape is the guess it
    // exists to replace.
    const value = text(row['value'])
    if (!value) continue
    found.push({
      id: text(row['id']),
      type: text(row['type']),
      value,
      disposition: text(row['disposition']),
      context: text(row['context']),
      source: text(row['source']),
      blocked: row['blocked'] === true,
      caseId: caseOf(row),
    })
  }

  for (const row of sources.malware) {
    // A digest of no recognised length is skipped rather than exported blank.
    const kind = hashTypeOf(row['hash'])
    if (!kind) continue
    found.push({
      id: text(row['id']),
      type: kind,
      value: text(row['hash']).toLowerCase(),
      disposition: text(row['verdict']),
      context: text(row['filename']),
      source: text(row['source']),
      blocked: false,
      caseId: caseOf(row),
    })
  }

  for (const row of sources.cloudApps) {
    const name = text(row['appName'])
    if (!name) continue
    found.push({
      id: text(row['id']),
      type: 'cloud-app',
      // Two tenants of one application are two rows, so the export has to
      // carry the pair -- the report says it the same way.
      value: qualified(name, text(row['instance'])),
      disposition: text(row['consentType']),
      context: text(row['publisher']),
      source: text(row['source']),
      blocked: false,
      caseId: caseOf(row),
    })
  }

  return found
}

/**
 * Whether an indicator belongs in a feed meant for action.
 *
 * A disposition the application does not recognise as harmless is actionable,
 * so a new verdict fails towards being seen.
 * -> `openspec/specs/data-exchange/spec.md`, *An indicator feed is what a
 * defender can act on*
 */
export function actionable(indicator: Indicator): boolean {
  // Trimmed as well as lowercased: `collect` trims what it reads off a row, so
  // a caller handing this a row it built itself is the one that can carry
  // `"  Benign  "` -- and a harmless row read as actionable is the direction
  // that puts a cleared address on a blocklist.
  return !NON_ACTIONABLE.has(indicator.disposition.trim().toLowerCase())
}

/** The CSV's columns, in order. */
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
 *
 * Every wire this app has speaks snake_case, so `caseId` reaches the file as
 * `case_id` - the same rule the per-table export follows by heading with the
 * database's column names rather than Drizzle's properties.
 */
export function toCsvRows(indicators: readonly Indicator[]): Record<string, string>[] {
  return indicators.map((one) => ({
    type: one.type,
    value: one.value,
    disposition: one.disposition,
    context: one.context,
    source: one.source,
    /**
     * **Rendered here, because the two doors write the file with different
     * writers.** `csv-stringify` casts a boolean to `1` and the empty string;
     * the browser joins cells itself and wrote `true` and `false`. So one
     * door's `blocked` column disagreed with the other's, and its `false` was
     * indistinguishable from a cell nobody filled in.
     */
    blocked: one.blocked ? 'true' : 'false',
    case_id: one.caseId,
  }))
}

const STIX_HASH_NAME: Record<string, string> = {
  sha256: 'SHA-256',
  sha1: 'SHA-1',
  md5: 'MD5',
}

/**
 * The STIX 2.1 pattern matching this indicator, or `null` for a kind with none.
 *
 * **A cloud app is not expressible as a STIX pattern**, so it is left out of a
 * bundle rather than emitted as an Indicator matching nothing. Everything else
 * reaching here is a kind this switch has not been taught, which is
 * indistinguishable from that deliberate skip, so `indicators.lists.test.ts`
 * holds the switch against `INDICATOR_TYPE`.
 */
export function patternFor(indicator: Indicator): string | null {
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
      return `[file:hashes.'${STIX_HASH_NAME[indicator.type] ?? ''}' = '${escaped}']`
    default:
      return null
  }
}

/**
 * Whether this row could reach a feed at all: actionable, and expressible.
 *
 * **Both halves, or a count says a case has things to push that it has not.**
 * A cloud app carries no pattern, so it can never be in a bundle whatever its
 * disposition; counting it made every case holding one report every indicator
 * as pushable, and the empty-bundle warning could never fire.
 */
export function pushable(indicator: Indicator): boolean {
  return actionable(indicator) && patternFor(indicator) !== null
}

/**
 * A STIX 2.1 bundle of the indicators worth acting on.
 *
 * `now` and `ids` are injected rather than read from the clock and the random
 * source, because a bundle nobody can reproduce cannot be asserted on.
 *
 * Throws where `tlp` names a level the vocabulary does not hold **and at least
 * one indicator survives the filter** -- the marking is read per surviving
 * object, so a bundle with none comes back unmarked rather than refused. Both
 * doors validate the level before calling, so this is the shape of the guard
 * rather than a state either can reach.
 */
export function toStixBundle(
  indicators: readonly Indicator[],
  options: { now: Date; tlp?: string | undefined; ids: () => string },
): Record<string, unknown> {
  const stamp = options.now.toISOString()

  const objects = indicators.filter(actionable).flatMap((indicator) => {
    const expression = patternFor(indicator)
    if (!expression) return []
    return [
      {
        type: 'indicator',
        spec_version: '2.1',
        // **Minted, never the case row's own id.** A database key reused as a
        // STIX id travels to whoever consumes the bundle, and two exports of
        // one row then carry one id with different content.
        id: `indicator--${options.ids()}`,
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

  // The marking leads the bundle, so a consumer reading in order has the
  // definition before the first object that references it.
  const marked = options.tlp ? [...tlpMarkingObjects(options.tlp), ...objects] : objects
  return { type: 'bundle', id: `bundle--${options.ids()}`, objects: marked }
}
