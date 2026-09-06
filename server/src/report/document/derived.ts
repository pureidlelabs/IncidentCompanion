/**
 * The sections derived from the case rather than listed out of it.
 *
 * Separate from `sections.ts` because the failure modes differ: a listing
 * section is wrong when it drops a row, and these are wrong when they *assert*
 * something the case never established - a dwell time on a live incident, a
 * "0 compromised" on a case nobody has scoped.
 *
 * **Nothing here counts what a lens already counts.** The Article 23 thresholds
 * and the GDPR triggers are the compliance tier's determination and arrive
 * through it; deriving them again is a second answer to one question.
 */
import type * as vocabularies from '../../domain/vocabularies.lists.js'
import { formatTimestamp } from './labels.js'
import type { Cell, Node } from './model.js'
import { PHASE_SEVERITY } from './palette.js'
import type { ReportInput } from './resolve.js'
import type { CaseData, SystemRow } from './sections.js'
import { band, idChip } from './strip.js'
import { UNKNOWN_STAGE_FILL } from './visuals.js'

/**
 * How many cells a wrapped band puts on a line.
 *
 * **Four for the phases and six for the ids**, because the content decides it:
 * `command and control` is three words and an ATT&CK id is nine characters. The
 * strip's three is a different number for the same reason - see `strip.ts`,
 * which carries the argument.
 */
const TECHNIQUE_COLS = 6

/**
 * The vocabularies, as types, so a literal compared against a row can be
 * checked against the list that produces it.
 *
 * **The row types cannot carry this and are not going to.** `SystemRow.verdict`
 * is a bare `string` because the column is one, and the two tests holding this
 * code honest deliberately feed it `'  Compromised  '` and a value the
 * vocabulary cannot produce - so narrowing the field would refuse the fixtures
 * written to attack it. What can be typed is the *literal on the other side of
 * the comparison*, which is where both figures that reached a customer went
 * wrong: `verdict === 'contained'` compiled and could never match.
 *
 * Imported as types only, so this costs no import at runtime.
 */
type AssetVerdict = (typeof vocabularies.ASSET_VERDICT)[number]
type Disposition = (typeof vocabularies.DISPOSITION)[number]
type DataDisposition = (typeof vocabularies.DATA_DISPOSITION)[number]

const label = (text: string): Cell => ({ text, kvLabel: true, bold: true })

/** A two-column metric/value table, which four of these sections all are. */
function factTable(input: ReportInput, rows: Cell[][]): Node[] {
  if (rows.length === 0) {
    return [{ type: 'prose', paras: [input.t('value.not_recorded')] }]
  }
  return [
    {
      type: 'table',
      header: [input.t('column.metric'), input.t('column.value')],
      rows,
      widths: [0.4, 0.6],
    },
  ]
}

/** Milliseconds between two stamps, or null when either is unstated. */
export function span(from: unknown, to: unknown): number | null {
  const a = from ? new Date(from as string).getTime() : NaN
  const b = to ? new Date(to as string).getTime() : NaN
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  const out = b - a
  return out < 0 ? null : out
}

/**
 * A duration in the coarsest unit that still says something.
 *
 * **Never "0 minutes".** A span under a minute is real and rounding it to zero
 * reads as nothing having elapsed, which on a detection figure is the opposite
 * of the truth.
 */
export function duration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${String(minutes)} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${String(hours)} h ${String(minutes % 60)} min`
  return `${String(Math.floor(hours / 24))} d ${String(hours % 24)} h`
}

/**
 * When the incident actually started: the earliest timeline entry.
 *
 * **Both response clocks anchor here, never on `openedAt`.** A case is opened
 * when somebody raises it, so anchoring there reports the time the SOC spent
 * rather than the time the adversary had, and both figures come out
 * flatteringly small without looking wrong.
 *
 * Undated entries are dropped: an entry nobody timed cannot be the first thing
 * that happened, and it sorts to the front of a naive `min`.
 */
export function incidentStart(data: CaseData): string | null {
  const times = (data.timeline ?? [])
    .map((row) => (row.time ? new Date(row.time as string).getTime() : NaN))
    .filter((at) => !Number.isNaN(at))
  if (times.length === 0) return null
  return new Date(Math.min(...times)).toISOString()
}

/**
 * The two response figures, resolved once for every section that prints them -
 * `metrics` and the exec card had already drifted, which is a document
 * disagreeing with itself about a number rather than a layout.
 *
 * `closedAt` counts only on a case whose status is closed: a stamp left behind
 * by a reopen would stop a clock that is still running.
 */
export interface ResponseClocks {
  toDetect: number | null
  dwell: number | null
  ongoing: boolean
}

/**
 * The closing stamp, or null on a case that is not closed.
 *
 * A `closedAt` outlives a reopen: the column is client-written, nothing on the
 * server clears it, and `status` is the field that says where the case stands.
 */
function closedStamp(data: CaseData): Date | string | null {
  return (data.status ?? '').trim().toLowerCase() === 'closed' ? (data.closedAt ?? null) : null
}

export function responseClocks(data: CaseData): ResponseClocks {
  const start = incidentStart(data)
  if (!start) return { toDetect: null, dwell: null, ongoing: false }

  const closed = closedStamp(data)
  const terminal = [data.containedAt, closed]
    .filter(Boolean)
    .map((at) => new Date(at as string).getTime())
    .filter((at) => !Number.isNaN(at))

  const end = terminal.length > 0 ? new Date(Math.min(...terminal)).toISOString() : null
  return {
    toDetect: span(start, data.detectedAt),
    dwell: span(start, end ?? new Date()),
    ongoing: end === null,
  }
}

/** A dwell figure that is still running says so, in the document's own words. */
export function dwellText(input: ReportInput, clocks: ResponseClocks): string | null {
  if (clocks.dwell === null) return null
  return clocks.ongoing
    ? `${duration(clocks.dwell)} (${input.t('value.ongoing')})`
    : duration(clocks.dwell)
}

/**
 * Verdicts that say an asset never needed containing.
 *
 * A verdict this does not name counts as needing containment, so a member
 * added to `ASSET_VERDICT` later enlarges the denominator - which understates
 * coverage rather than claiming a host was contained.
 */
const UNCONCERNING_VERDICTS: ReadonlySet<string> = new Set(
  ['unknown', 'clean'] satisfies AssetVerdict[],
)

/**
 * The assets the incident reached, by the analyst's own verdict.
 *
 * An unadjudicated asset is not counted: a blank verdict is a question nobody
 * has answered yet, and `unknown` is that answer written down. Both are
 * absences, and neither is a finding of harm.
 */
function affectedAssets(systems: SystemRow[]): SystemRow[] {
  return systems.filter((row) => {
    const verdict = (row.verdict ?? '').trim().toLowerCase()
    return verdict !== '' && !UNCONCERNING_VERDICTS.has(verdict)
  })
}

/**
 * How many assets the incident reached.
 *
 * **The catalogue is not the answer.** `systems` is every host an analyst
 * entered while scoping, bystanders included, so its length is the size of the
 * estate under review - which `impact.assets` already reports, under the
 * honest heading "Assets in scope".
 *
 * Shares its predicate with `containmentCoverage`, whose denominator is this
 * same set: the two print one row apart, so a host that is affected by one
 * definition and not by the other reads as an arithmetic error.
 */
export function hostsAffected(systems: SystemRow[]): number {
  return affectedAssets(systems).length
}

/**
 * Of the assets whose verdict says they needed containing, how many are
 * isolated.
 *
 * Null where nothing needed containing, or nothing has been - the caller
 * renders no row rather than "0 of 12".
 *
 * An asset is contained by its `isolated` flag. `ASSET_VERDICT` carries no
 * `contained` member, so a verdict cannot express it.
 */
export function containmentCoverage(
  systems: SystemRow[],
): { isolated: number; needing: number } | null {
  const needing = affectedAssets(systems)
  const isolated = needing.filter((row) => row.isolated === true).length
  if (needing.length === 0 || isolated === 0) return null
  return { isolated, needing: needing.length }
}

/**
 * The response clock, and how far the incident reached.
 *
 * **A dwell time on an incident that is still running says so.** Python folds
 * "ongoing" in through its own key and an earlier reading dropped it, which
 * published a settled-looking dwell figure for a live incident. The same rule
 * is why an unreached stamp produces no row at all rather than an empty one.
 */
export function metrics(input: ReportInput): Node[] {
  const data = input.caseData
  if (!data) return []
  const rows: Cell[][] = []

  const clocks = responseClocks(data)
  if (clocks.toDetect !== null) {
    rows.push([label(input.t('metric.time_to_detect')), { text: duration(clocks.toDetect) }])
  }

  const dwell = dwellText(input, clocks)
  if (dwell !== null) {
    rows.push([label(input.t('metric.dwell')), { text: dwell }])
  }

  // **The verdict, never the catalogue.** An estate of thirty scoped hosts
  // with three adjudicated is a "3" here; printing "30" tells a customer their
  // whole estate was touched. Omitted at zero for the reason the coverage row
  // below is: on a case nobody has adjudicated, "0" reads as a finding of no
  // harm rather than as the absence of a finding.
  const systems = data.systems ?? []
  const affected = hostsAffected(systems)
  if (affected > 0) {
    rows.push([label(input.t('metric.hosts_affected')), { text: String(affected) }])
  }

  // **The same closed gate the response clocks use.** `closedAt` is
  // client-written and no server code clears it, so a case that was reopened
  // still carries the stamp - and an age that stopped above a dwell that is
  // still running is a table disagreeing with itself about whether the
  // incident is over.
  const age = span(data.openedAt, closedStamp(data) ?? new Date())
  if (age !== null) {
    rows.push([label(input.t('metric.case_age')), { text: duration(age) }])
  }

  // **Containment coverage, only where something has been contained.** A
  // "0 of 12" on every unworked case is noise rather than a measurement.
  const coverage = containmentCoverage(systems)
  if (coverage !== null) {
    rows.push([
      label(input.t('metric.containment_coverage')),
      {
        text: `${String(coverage.isolated)} ${input.t('value.of')} ${String(coverage.needing)}`,
      },
    ])
  }

  return factTable(input, rows)
}

/**
 * How they got in, what kind of attack it was, and why it was not caught sooner.
 *
 * **The detection gap belongs here rather than under metrics** - it is a root
 * cause, not a response figure. The written analysis that reads these facts
 * stays a separate block, so regenerating the case cannot touch the analyst's
 * words.
 */
export function rootCause(input: ReportInput): Node[] {
  const data = input.caseData
  if (!data) return []
  const missing = input.t('value.not_recorded')

  const rows: Cell[][] = [
    [
      label(input.t('field.initial_access')),
      { text: data.initialAccessVector || missing },
    ],
  ]
  if (data.incidentClass) {
    rows.push([
      label(input.t('rootcause.threat_action')),
      { text: data.incidentClass },
    ])
  }
  if (data.detectionSource) {
    rows.push([
      label(input.t('field.detection_source')),
      { text: data.detectionSource },
    ])
  }
  return factTable(input, rows)
}

/** The verdict that says the incident owned the asset outright. */
const COMPROMISED = 'compromised' satisfies AssetVerdict

/** An indicator the analyst assessed as hostile, as distinct from suspicious. */
const MALICIOUS = 'malicious' satisfies Disposition

/**
 * The disposition that says the analyst looked and nothing happened to it.
 *
 * `DATA_DISPOSITION` carries `untouched` for that finding specifically, and it
 * is the one member this row must not print: a dataset listed under *Data
 * affected* is a claim of harm the case record contradicts. `unknown` stays -
 * it is "believed involved, disposition not established", which is a dataset
 * in the incident with the question open.
 */
const ASSESSED_UNHARMED: ReadonlySet<string> = new Set(['untouched'] satisfies DataDisposition[])

/**
 * How bad it was and how far it reached - the countable half only; what it cost
 * is a written block the layouts pair with this one.
 *
 * A breakdown row appears only when it carries a figure, since a "0
 * compromised" on an unscoped case is read as a measurement. Severity is always
 * stated, because an unstated severity is itself the finding.
 */
export function impact(input: ReportInput): Node[] {
  const data = input.caseData
  if (!data) return []
  const missing = input.t('value.not_recorded')

  const systems = data.systems ?? []
  const accounts = data.accounts ?? []
  const rows: Cell[][] = [
    [label(input.t('impact.severity')), { text: data.severity || missing }],
    [label(input.t('impact.assets')), { text: String(systems.length) }],
  ]

  const compromised = systems.filter(
    (row) => (row.verdict ?? '').toLowerCase() === COMPROMISED,
  ).length
  if (compromised > 0) {
    rows.push([
      label(input.t('impact.assets_compromised')),
      { text: String(compromised) },
    ])
  }
  rows.push([label(input.t('impact.accounts')), { text: String(accounts.length) }])

  const malicious = (data.networkIndicators ?? []).filter(
    (row) => (row.disposition ?? '').toLowerCase() === MALICIOUS,
  ).length
  if (malicious > 0) {
    rows.push([
      label(input.t('impact.indicators_malicious')),
      { text: String(malicious) },
    ])
  }

  // **Always stated, "none" included.** What left the building is the question
  // Article 23 and Article 33 both turn on, and an omitted row reads as
  // unasked rather than as answered no.
  const taken = (data.impact ?? [])
    .filter((row) => !ASSESSED_UNHARMED.has((row.disposition ?? '').trim().toLowerCase()))
    .map((row) => row.label)
    .filter((one): one is string => Boolean(one))
  rows.push([
    label(input.t('impact.data')),
    { text: taken.length > 0 ? taken.join(', ') : input.t('impact.no_data') },
  ])

  return factTable(input, rows)
}

/** Every tactic the timeline reached, with the id that makes it findable. */
const TACTIC_IDS: Record<string, string> = {
  reconnaissance: 'TA0043',
  'resource development': 'TA0042',
  'initial access': 'TA0001',
  execution: 'TA0002',
  persistence: 'TA0003',
  'privilege escalation': 'TA0004',
  'defense evasion': 'TA0005',
  'credential access': 'TA0006',
  discovery: 'TA0007',
  'lateral movement': 'TA0008',
  collection: 'TA0009',
  'command and control': 'TA0011',
  exfiltration: 'TA0010',
  impact: 'TA0040',
}


/** The phases a kill chain runs through, in the order they are reached. */
const PHASE_ORDER = [
  'reconnaissance',
  'resource development',
  'initial access',
  'execution',
  'persistence',
  'privilege escalation',
  'defense evasion',
  'credential access',
  'discovery',
  'lateral movement',
  'collection',
  'command and control',
  'exfiltration',
  'impact',
]

/** Tactics named by the timeline, lower-cased and de-duplicated. */
function tacticsUsed(data: CaseData | undefined): string[] {
  const seen = new Set<string>()
  for (const row of data?.timeline ?? []) {
    const tactic = (row.tactic ?? '').trim().toLowerCase()
    if (tactic) seen.add(tactic)
  }
  return [...seen]
}

/**
 * Only the terms this report actually uses.
 *
 * **The ATT&CK id rather than a written definition.** It is what makes the term
 * findable, it needs no translating and no maintaining, and a definition this
 * app invented would compete with MITRE's own. The column header stays English
 * for the same reason the tactic names do - a reader looking one up searches
 * for it in English.
 */
export function glossary(input: ReportInput): Node[] {
  const used = tacticsUsed(input.caseData).sort()
  if (used.length === 0) {
    return [{ type: 'prose', paras: [input.t('value.none')] }]
  }
  return [
    {
      type: 'table',
      header: [input.t('column.term'), 'ATT&CK ID'],
      rows: used.map((term): Cell[] => [
        { text: term },
        { text: TACTIC_IDS[term] ?? '', mono: true },
      ]),
      widths: [0.7, 0.3],
    },
  ]
}

/** Each tactic and the techniques recorded under it. */
function techniqueGroups(data: CaseData | undefined): [string, string[]][] {
  const groups = new Map<string, Set<string>>()
  for (const row of data?.timeline ?? []) {
    const tactic = (row.tactic ?? '').trim().toLowerCase()
    const technique = (row.technique ?? '').trim()
    if (!tactic || !technique) continue
    const held = groups.get(tactic) ?? new Set<string>()
    held.add(technique)
    groups.set(tactic, held)
  }
  return [...groups.entries()]
    .map(([tactic, held]): [string, string[]] => [tactic, [...held].sort()])
    .sort((a, b) => PHASE_ORDER.indexOf(a[0]) - PHASE_ORDER.indexOf(b[0]))
}

/**
 * The techniques seen, grouped under the tactic they served.
 *
 * **Ordered by phase, not alphabetically.** The sequence is the reading: a
 * reader scanning this is asking how far the intrusion got, and an
 * alphabetical list answers a question nobody asked.
 */
export function techniques(input: ReportInput): Node[] {
  const groups = techniqueGroups(input.caseData)
  if (groups.length === 0) {
    return [{ type: 'prose', paras: [input.t('value.none')] }]
  }
  /**
   * **A chip each, flat, in kill-chain order - not grouped by tactic.** With
   * one technique per tactic, which is the common case, a grouped list stacks
   * into a tall column of one-item rows; and the phase story already lives in
   * the ribbon above. What this block is for is *which ids were seen*, and an
   * identifier set in prose is one nobody checks against their own tooling.
   */
  const seen: string[] = []
  for (const [, list] of groups) {
    for (const technique of list) if (!seen.includes(technique)) seen.push(technique)
  }
  return band(seen.map(idChip), TECHNIQUE_COLS)
}

/**
 * Every technique once, with how often it was seen and when.
 *
 * **A roll-up, so a technique recorded twelve times is one row carrying 12.**
 * The timeline already lists the occurrences; repeating them here would make
 * the busiest technique the hardest to see.
 */
export function techniqueTable(input: ReportInput): Node[] {
  const seen = new Map<string, { tactic: string; count: number; first: string; last: string }>()
  for (const row of input.caseData?.timeline ?? []) {
    const technique = (row.technique ?? '').trim()
    if (!technique) continue
    const at = row.time ? new Date(row.time).toISOString() : ''
    const held = seen.get(technique)
    if (!held) {
      seen.set(technique, {
        tactic: (row.tactic ?? '').trim().toLowerCase(),
        count: 1,
        first: at,
        last: at,
      })
      continue
    }
    held.count += 1
    // A blank stamp must not become the earliest time by sorting first.
    if (at && (!held.first || at < held.first)) held.first = at
    if (at && at > held.last) held.last = at
  }

  if (seen.size === 0) {
    return [{ type: 'prose', paras: [input.t('value.none')] }]
  }

  return [
    {
      type: 'table',
      header: [
        input.t('column.technique'),
        input.t('column.tactic'),
        input.t('column.events'),
        input.t('column.first_seen'),
        input.t('column.last_seen'),
      ],
      rows: [...seen.entries()]
        .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
        .map(([technique, held]): Cell[] => [
          { text: technique, mono: true },
          { text: held.tactic },
          { text: String(held.count), align: 'right' },
          // **No zone on the value: both column titles carry it.** That is
          // `formatTimestamp`'s own stated rule, and breaking it costs four
          // characters a cell -- enough to wrap `UTC` onto a second line under
          // every stamp, in a column that already says UTC.
          { text: formatTimestamp(held.first, { zone: false }), mono: true },
          { text: formatTimestamp(held.last, { zone: false }), mono: true },
        ]),
      widths: [0.24, 0.22, 0.1, 0.22, 0.22],
    },
  ]
}

/**
 * The phases the intrusion reached, as a path - a drawing, and the only one in
 * this document. -> `spine.ts`
 *
 * The ramp is the kill chain grid's, so one document cannot colour a phase two
 * ways.
 */
export function ribbon(input: ReportInput): Node[] {
  const used = new Set(tacticsUsed(input.caseData))
  const reached = PHASE_ORDER.filter((phase) => used.has(phase))
  if (reached.length === 0) {
    return [{ type: 'prose', paras: [input.t('empty.timeline')] }]
  }
  return [
    {
      type: 'spine',
      phases: reached.map((phase) => ({
        label: phase,
        fill: PHASE_SEVERITY[phase] ?? UNKNOWN_STAGE_FILL,
      })),
      // Reached-of-total is where "how far" lives: with no empty cells the
      // band has no unfilled remainder to say it.
      foot:
        `${input.t('ribbon.phases_reached')}: ${String(reached.length)} ` +
        `${input.t('value.of')} ${String(PHASE_ORDER.length)}`,
    },
  ]
}
