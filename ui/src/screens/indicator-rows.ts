import {
  collect,
  pushable,
  toCsvRows,
  toStixBundle,
  INDICATOR_CSV_COLUMNS,
  type Indicator,
} from '@contract/indicators.lists'
import { neutralise } from '@contract/spreadsheet.lists'

import type { Case } from '@/api/model'
import { matchesWords } from '@/lib/word-match'

/**
 * The indicator export, as the screen serves it.
 *
 * **The rules are `@contract/indicators.lists` and this chooses rows.** What an
 * indicator is, which columns a file has and what a bundle looks like were
 * written here as well as on the server, and the two copies disagreed about
 * seven things - a column, a cloud app's value and disposition, the rule for
 * what is worth pushing, which rows a bundle carries, three properties STIX
 * requires, and whether a CSV may be marked. -> #569
 *
 * What stays here is the difference worth keeping: the route exports the whole
 * case, and this exports the rows the analyst has filtered to, as a `data:` URL
 * that needs no round trip.
 *
 * Its own module rather than the screen's, so the derivation can be tested
 * without rendering a table.
 */

export type { Indicator }
export { pushable }

/** The case's indicators, in table order. */
export function collectIndicators(kase: Case): Indicator[] {
  return collect(
    { networkIndicators: kase.networkIndicators, malware: kase.malware, cloudApps: kase.cloudApps },
    kase.id,
  )
}

/**
 * How many of these the analyst could push.
 *
 * `pushable` rather than `actionable`: a row with no STIX pattern can never be
 * in a bundle, so counting it tells the analyst a case has things to send that
 * it has not.
 */
export function actionableCount(rows: readonly Indicator[]): number {
  return rows.filter(pushable).length
}

/**
 * True only when the case has indicators and none of them could be pushed: the
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
 * it are their own columns and are not searched.
 */
export function matchesIndicator(row: Indicator, query: string): boolean {
  return matchesWords(row.value, query)
}

/**
 * The rows as CSV.
 *
 * **No handling restriction.** A CSV is an inventory rather than a feed, and
 * the specification refuses a restriction named for a form that cannot carry
 * one - which is what the route answers 400 to.
 * -> `openspec/specs/data-exchange/spec.md`
 *
 * Quoting is unconditional: a `context` holding a comma is the ordinary case,
 * and a quote-when-needed rule is one branch nobody reads until it is wrong.
 * Every cell is defused first, because a spreadsheet executes a leading `=`
 * and these values came out of an incident.
 */
export function indicatorsCsv(rows: readonly Indicator[]): string {
  const cell = (value: unknown) => `"${String(neutralise(value)).replace(/"/g, '""')}"`
  const lines = [INDICATOR_CSV_COLUMNS.join(',')]
  for (const record of toCsvRows(rows)) {
    lines.push(INDICATOR_CSV_COLUMNS.map((column) => cell(record[column])).join(','))
  }
  return `${lines.join('\n')}\n`
}

/**
 * The rows as a STIX 2.1 bundle, carrying the restriction it is shared under.
 *
 * The clock and the identifier source are this door's to supply; what the
 * bundle holds is `@contract/indicators.lists`.
 */
export function indicatorsStix(rows: readonly Indicator[], tlp: string): string {
  return `${JSON.stringify(
    toStixBundle(rows, {
      now: new Date(),
      ...(tlp ? { tlp } : {}),
      ids: () => crypto.randomUUID(),
    }),
    null,
    2,
  )}\n`
}
