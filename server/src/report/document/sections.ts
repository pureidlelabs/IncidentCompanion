/**
 * The generated sections: case data in, document nodes out.
 */
import {
  containmentCoverage,
  duration,
  dwellText,
  hostsAffected,
  responseClocks,
} from './derived.js'
import { qualified } from '../../domain/naming.lists.js'
import type * as vocabularies from '../../domain/vocabularies.lists.js'
import { formatTimestamp } from './labels.js'
import type { Cell, Node } from './model.js'
import { ACCENT, HIGH, MUTED, RESPONSE } from './palette.js'
import type { ReportInput } from './resolve.js'
import { consecutiveRuns } from './runs.js'
import { strip } from './strip.js'

type TaskStatus = (typeof vocabularies.TASK_STATUS)[number]

/** The case row and its collections, as the case document serves them. */
export interface CaseData extends Record<string, unknown> {
  id: string
  title: string
  customer?: string | null
  reference?: string | null
  /** What happened, in the analyst's own words. The cover's headline. */
  summary?: string | null
  analyst?: string | null
  status?: string | null
  severity?: string | null
  incidentClass?: string | null
  detectionSource?: string | null
  initialAccessVector?: string | null
  openedAt?: Date | string | null
  detectedAt?: Date | string | null
  containedAt?: Date | string | null
  eradicatedAt?: Date | string | null
  recoveredAt?: Date | string | null
  closedAt?: Date | string | null
  timeline?: TimelineRow[]
  systems?: SystemRow[]
  accounts?: AccountRow[]
  networkIndicators?: IndicatorRow[]
  malware?: MalwareRow[]
  cloudApps?: CloudAppRow[]
  evidence?: EvidenceRow[]
  actions?: ActionRow[]
  /**
   * What was taken or exposed - named for the table, which the report section of
   * the same name reads.
   */
  impact?: ImpactRow[]
  /** How each finding was obtained. Walked at render, exactly like `evidence`. */
  methods?: MethodRow[]
}

/**
 * A method as the case document serves it.
 */
interface MethodRow {
  name?: string | null
  kind?: string | null
  established?: string | null
  console?: string | null
  workspace?: string | null
  runBy?: string | null
  runAt?: Date | string | null
  grammar?: string | null
  query?: string | null
  windowFrom?: Date | string | null
  windowTo?: Date | string | null
  rowsReturned?: number | null
  resultColumns?: string | null
  resultExcerpt?: string | null
}

interface ImpactRow {
  label?: string | null
  category?: string | null
  disposition?: string | null
}

interface EvidenceRow {
  name?: string | null
  type?: string | null
  location?: string | null
  hash?: string | null
  hashAlgorithm?: string | null
  dataClassification?: string | null
}

interface ActionRow {
  task?: string | null
  taskType?: string | null
  assignee?: string | null
  dateDue?: Date | string | null
  status?: string | null
}

interface TimelineRow {
  /** The ATT&CK tactic, lower-cased in the data. Drives four derived sections. */
  tactic?: string | null
  time?: Date | string | null
  /** What happened. The column is `description`, not `event`. */
  description?: string | null
  /** Who did it. The column is `author`, not `actor`. */
  author?: string | null
  /**
   * `event` or `action` - which side of the incident this beat is.
   */
  kind?: string | null
  /**
   * A reference, not a name - see `timeline` for why that matters.
   */
  systemId?: string | null
  sourceSystemId?: string | null
  technique?: string | null
  /** How well the beat is known, and what saw it. Printed as one cell. */
  confidence?: string | null
  sourceTool?: string | null
}

export interface SystemRow {
  id: string
  hostname?: string | null
  systemType?: string | null
  zone?: string | null
  verdict?: string | null
  /** Containment. An asset is contained by this flag, never by its verdict. */
  isolated?: boolean | null
}

interface AccountRow {
  id: string
  accountName?: string | null
  domain?: string | null
  privileges?: string | null
}

interface IndicatorRow {
  id: string
  type?: string | null
  value?: string | null
  port?: string | null
  disposition?: string | null
  context?: string | null
}

interface MalwareRow {
  id: string
  filename?: string | null
  hash?: string | null
  verdict?: string | null
  family?: string | null
}

interface CloudAppRow {
  appName?: string | null
  instance?: string | null
  publisher?: string | null
  verifiedPublisher?: string | null
}

/**
 * The incident header: who, which case, and the response clock.
 */
export function caseHeader(input: ReportInput): Node[] {
  const data = input.caseData
  if (!data) return []
  const missing = input.t('value.not_recorded')

  /**
   * **The identity facts and the response clock in one strip**, which is what
   * lets the standard layout drop the `metrics` block.
   */
  const figures: [string, string][] = [
    [input.t('field.customer'), data.customer || missing],
    [input.t('field.reference'), data.reference || missing],
    [input.t('field.analyst'), data.analyst || missing],
    [input.t('field.status'), data.status || missing],
  ]

  // **Stated, never derived.** An unclassified case shows no figure rather than
  // a defensible-looking guess, and `unknown` is the absence of an answer
  // rather than an answer - it is not in this server's vocabulary for exactly
  // that reason.
  if (data.severity) figures.push([input.t('field.severity'), data.severity])
  if (data.incidentClass) figures.push([input.t('field.incident_class'), data.incidentClass])

  const clocks = responseClocks(data)
  if (clocks.toDetect !== null) {
    figures.push([input.t('metric.time_to_detect'), duration(clocks.toDetect)])
  }
  const dwell = dwellText(input, clocks)
  if (dwell !== null) figures.push([input.t('metric.dwell'), dwell])

  // Both figures read off the verdict rather than the catalogue, and off the
  // same predicate - the strip prints them side by side, so a host counted as
  // affected here and absent from the coverage denominator reads as an error
  // in the arithmetic.
  const systems = data.systems ?? []
  const affected = hostsAffected(systems)
  if (affected > 0) {
    figures.push([input.t('metric.hosts_affected'), String(affected)])
  }

  // Only where something has been contained: "0 of 12" on every unworked
  // case is noise a reader takes for a measurement of the response.
  const coverage = containmentCoverage(systems)
  if (coverage !== null) {
    figures.push([
      input.t('metric.containment_coverage'),
      `${String(coverage.isolated)} ${input.t('value.of')} ${String(coverage.needing)}`,
    ])
  }

  /**
   * **The provenance and the six stamps carry to the foot.**
   */
  const foot: string[] = []
  if (data.detectionSource) {
    foot.push(`${input.t('field.detection_source')}: ${data.detectionSource}`)
  }
  if (data.initialAccessVector) {
    foot.push(`${input.t('field.initial_access')}: ${data.initialAccessVector}`)
  }
  for (const [key, stamp] of [
    ['field.opened', data.openedAt],
    ['field.detected', data.detectedAt],
    ['field.contained', data.containedAt],
    ['field.eradicated', data.eradicatedAt],
    ['field.recovered', data.recoveredAt],
    ['field.closed', data.closedAt],
  ] as const) {
    const printed = formatTimestamp(stamp)
    if (printed) foot.push(`${input.t(key)}: ${printed}`)
  }

  return [
    ...strip(figures),
    ...(foot.length > 0
      ? [{ type: 'prose' as const, paras: [foot.join(' \u00b7 ')] }]
      : []),
  ]
}

/**
 * The timeline of events, in time order, with an undated entry sorted last.
 */
export function timeline(input: ReportInput): Node[] {
  const rows = input.caseData?.timeline ?? []
  if (rows.length === 0) {
    return [{ type: 'prose', paras: [input.t('empty.timeline')] }]
  }

  const ordered = [...rows].sort((a, b) => {
    const left = a.time ? new Date(a.time).getTime() : Number.POSITIVE_INFINITY
    const right = b.time ? new Date(b.time).getTime() : Number.POSITIVE_INFINITY
    return left - right
  })

  /**
   * Neighbouring beats that say the same thing are one row, grouped through
   * `consecutiveRuns` like every other timeline renderer.
   */
  const runs = consecutiveRuns(ordered, (entry) =>
    JSON.stringify([
      entry.description ?? '',
      entry.kind ?? '',
      entry.technique ?? '',
      entry.systemId ?? '',
      entry.confidence ?? '',
      entry.sourceTool ?? '',
    ]),
  )

  return [
    {
      type: 'table',
      header: [
        input.t('column.time'),
        input.t('column.actor'),
        input.t('column.technique'),
        input.t('column.event'),
        input.t('column.assurance'),
      ],
      rows: runs.map((run): Cell[] => {
        const entry = run[0]!
        const last = run[run.length - 1]!
        const isAction = entry.kind === 'action'
        // **How well it is known, or an em dash.** An empty cell reads as a
        // column that failed to render rather than as an unstated confidence.
        const assurance =
          [entry.confidence, entry.sourceTool].filter(Boolean).join(' \u00b7 ') || '\u2014'

        return [
          { text: runTime(run[0]!.time, last.time), mono: true },
          {
            text: input.t(isAction ? 'value.response' : 'value.adversary'),
            bold: true,
            ink: isAction ? RESPONSE : HIGH,
          },
          {
            text: entry.technique || '\u2014',
            mono: true,
            ink: entry.technique ? ACCENT : MUTED,
          },
          { text: (entry.description ?? '') + countSuffix(run.length) },
          { text: assurance, ink: MUTED },
        ]
      }),
      // Time keeps the width a single stamp does not need, because a grouped
      // row prints two. Technique's share is Word's number rather than the
      // PDF's; neither may be narrowed against a pdfmake render alone.
      widths: [0.15, 0.14, 0.15, 0.34, 0.22],
    },
  ]
}

/**
 * The window a grouped row covers, or the one stamp it sits at.
 */
function runTime(from: Date | string | null | undefined, to: Date | string | null | undefined): string {
  const first = formatTimestamp(from, { zone: false })
  const last = formatTimestamp(to, { zone: false })
  return first === last ? first : `${first} \u2013 ${last}`
}

/**
 * ` (x3)` for a grouped run, empty for a single beat.
 */
function countSuffix(length: number): string {
  return length === 1 ? '' : ` (\u00d7${String(length)})`
}

/**
 * How each finding was obtained - the methods appendix.
 */
export function methods(input: ReportInput): Node[] {
  const rows = input.caseData?.methods ?? []
  if (rows.length === 0) {
    return [{ type: 'prose', paras: [input.t('empty.methods')] }]
  }

  const missing = input.t('value.not_stated')

  /** Where it ran and over what, as one cell: a reader opens a console, not a field. */
  const whereAndWhen = (row: MethodRow): string => {
    const place = [row.console, row.workspace].filter(Boolean).join(' \u00b7 ')
    const from = formatTimestamp(row.windowFrom, { zone: false })
    const to = formatTimestamp(row.windowTo, { zone: false })
    // The pair reads as a range, so the zone is said once at the end.
    const window = from && to ? `${from} \u2192 ${to} UTC` : from || to || missing
    return place ? `${place}\n${window}` : window
  }

  const nodes: Node[] = [
    {
      type: 'table',
      header: [
        input.t('column.method_ref'),
        input.t('column.established'),
        input.t('column.where_and_window'),
        input.t('column.rows_returned'),
      ],
      rows: rows.map((row, at): Cell[] => [
        { text: reference(at), mono: true },
        { text: row.established || row.name || missing },
        { text: whereAndWhen(row), ink: MUTED },
        {
          // **Null and zero are two answers.** Nothing came back is a result;
          // nobody stated it is not, and a blank cell reads as neither.
          text: row.rowsReturned === null || row.rowsReturned === undefined
            ? missing
            : String(row.rowsReturned),
          align: 'right',
        },
      ]),
      widths: [0.09, 0.4, 0.36, 0.15],
    },
  ]

  for (const [at, row] of rows.entries()) {
    nodes.push({
      type: 'minorHead',
      text: [reference(at), row.name].filter(Boolean).join(' \u00b7 '),
    })

    const provenance = [
      row.console && `${input.t('field.console')}: ${row.console}`,
      row.workspace && `${input.t('field.workspace')}: ${row.workspace}`,
      row.runBy && `${input.t('field.run_by')}: ${row.runBy}`,
      row.runAt && `${input.t('field.run_at')}: ${formatTimestamp(row.runAt)}`,
    ].filter(Boolean) as string[]
    if (provenance.length > 0) nodes.push({ type: 'prose', paras: [provenance.join(' \u00b7 ')] })

    if (row.query) {
      nodes.push({
        type: 'code',
        lines: row.query.split('\n'),
        ...(row.grammar ? { language: row.grammar } : {}),
        verbatim: true,
      })
    }

    /**
     * **The count says whose number it is, every time it is printed.**
     */
    const returned =
      row.rowsReturned === null || row.rowsReturned === undefined
        ? input.t('value.rows_not_stated')
        : input.t('value.rows_as_recorded').replace('{n}', String(row.rowsReturned))
    const shape = row.resultColumns ? `${returned} \u00b7 ${row.resultColumns}` : returned
    nodes.push({ type: 'prose', paras: [shape] })

    // Quoted telemetry, so it is an ordinary code node and defangs.
    if (row.resultExcerpt) {
      nodes.push({ type: 'code', lines: row.resultExcerpt.split('\n') })
    }
  }

  return nodes
}

/** `M-1`, `M-2` - derived from position, never stored. */
function reference(at: number): string {
  return `M-${at + 1}`
}

/**
 * The evidence register, with the hashes that make it a register - NIST
 * `RS.AN-06` and `RS.AN-07`.
 */
export function evidence(input: ReportInput): Node[] {
  const rows = input.caseData?.evidence ?? []
  if (rows.length === 0) {
    return [{ type: 'prose', paras: [input.t('empty.evidence')] }]
  }

  return [
    {
      type: 'table',
      header: [
        input.t('column.evidence'),
        input.t('column.type'),
        input.t('column.location'),
        input.t('column.hash'),
        input.t('column.classification'),
      ],
      rows: rows.map((row): Cell[] => [
        { text: row.name ?? '' },
        { text: row.type ?? '' },
        { text: row.location ?? '' },
        {
          text: row.hash ? `${row.hashAlgorithm ? row.hashAlgorithm + ':' : ''}${row.hash}` : '',
          mono: true,
        },
        { text: row.dataClassification ?? '' },
      ]),
      widths: [0.24, 0.13, 0.24, 0.25, 0.14],
    },
  ]
}

/**
 * What was done, and what is still open - as two tables rather than one,
 * because NIS2 Article 23 asks a final report for "applied and ongoing
 * mitigation measures" and that is two claims.
 */
export function actions(input: ReportInput): Node[] {
  const rows = input.caseData?.actions ?? []
  if (rows.length === 0) {
    return [{ type: 'prose', paras: [input.t('empty.actions')] }]
  }

  // **Checked against the vocabulary, not typed against it.** `ActionRow.status`
  // is a bare `string`; the literal is what can be held to the list, and an
  // unchecked one here would silently file every action as outstanding.
  const settled: ReadonlySet<string> = new Set(
    ['completed', 'cancelled'] satisfies TaskStatus[],
  )
  const groups: [string, ActionRow[]][] = [
    ['heading.applied', rows.filter((row) => settled.has(row.status ?? ''))],
    ['heading.outstanding', rows.filter((row) => !settled.has(row.status ?? ''))],
  ]

  const nodes: Node[] = []
  for (const [key, group] of groups) {
    if (group.length === 0) continue
    nodes.push({ type: 'minorHead', text: input.t(key) })
    nodes.push({
      type: 'table',
      header: [
        input.t('column.task'),
        input.t('column.type'),
        input.t('column.assignee'),
        input.t('column.due'),
        input.t('column.status'),
      ],
      rows: group.map((row): Cell[] => [
        { text: row.task ?? '' },
        { text: row.taskType ?? '' },
        { text: row.assignee ?? '' },
        { text: formatTimestamp(row.dateDue) },
        { text: row.status ?? '' },
      ]),
      widths: [0.4, 0.14, 0.16, 0.16, 0.14],
    })
  }
  return nodes
}

/**
 * One table of rows, or a line of prose when there are none. Every roll-up
 * below goes through it, so the empty state cannot diverge per entity kind.
 */
function listing(
  heading: string,
  header: string[],
  rows: Cell[][],
  empty: string,
  widths: number[],
): Node[] {
  const head: Node = { type: 'minorHead', text: heading }
  if (rows.length === 0) return [head, { type: 'prose', paras: [empty] }]
  return [head, { type: 'table', header, rows, widths }]
}

/**
 * The entities the case touched: assets, accounts, indicators, malware and
 * cloud apps.
 */
export function entities(input: ReportInput): Node[] {
  const data = input.caseData
  const t = input.t

  return [
    ...listing(
      t('heading.assets'),
      [
        t('column.asset'),
        t('column.type'),
        t('column.zone'),
        t('column.verdict'),
      ],
      (data?.systems ?? []).map((row): Cell[] => [
        { text: row.hostname ?? '', indicator: true },
        { text: row.systemType ?? '' },
        { text: row.zone ?? '' },
        { text: row.verdict ?? '' },
      ]),
      t('empty.assets'),
      [0.34, 0.22, 0.22, 0.22],
    ),
    ...listing(
      t('heading.accounts'),
      [t('column.account'), t('column.domain'), t('column.privileges')],
      (data?.accounts ?? []).map((row): Cell[] => [
        { text: row.accountName ?? '' },
        { text: row.domain ?? '', indicator: true },
        { text: row.privileges ?? '' },
      ]),
      t('empty.accounts'),
      [0.4, 0.3, 0.3],
    ),
    ...listing(
      t('heading.network_indicators'),
      [t('column.indicator'), t('column.disposition'), t('column.context')],
      (data?.networkIndicators ?? []).map((row): Cell[] => [
        // **The address, whichever kind it is.** A row carries an IP or a
        // domain and rarely both; two columns would be one empty cell per row.
        { text: row.value ?? '', indicator: true, mono: true },
        { text: row.disposition ?? '' },
        { text: row.context ?? '' },
      ]),
      t('empty.indicators'),
      [0.34, 0.2, 0.46],
    ),
    ...listing(
      t('heading.malware'),
      [
        t('column.malware'),
        t('column.hash'),
        t('column.family'),
        t('column.verdict'),
      ],
      (data?.malware ?? []).map((row): Cell[] => [
        { text: row.filename ?? '', indicator: true },
        { text: row.hash ?? '', mono: true },
        { text: row.family ?? '' },
        { text: row.verdict ?? '' },
      ]),
      t('empty.malware'),
      [0.3, 0.34, 0.18, 0.18],
    ),
    ...listing(
      t('heading.cloud_apps'),
      [t('column.cloud_app'), t('column.publisher'), t('column.verified')],
      (data?.cloudApps ?? []).map((row): Cell[] => [
        { text: appAndInstance(row) },
        { text: row.publisher ?? '' },
        { text: row.verifiedPublisher ?? '' },
      ]),
      t('empty.cloud_apps'),
      [0.4, 0.35, 0.25],
    ),
  ]
}

/**
 * The indicators of compromise, on their own - the same rows the entity roll-
 * up carries, so a layout including both prints them twice.
 */
export function indicators(input: ReportInput): Node[] {
  const rows = input.caseData?.networkIndicators ?? []
  if (rows.length === 0) {
    return [{ type: 'prose', paras: [input.t('empty.indicators')] }]
  }

  return [
    {
      type: 'table',
      header: [
        input.t('column.indicator'),
        input.t('column.port'),
        input.t('column.disposition'),
        input.t('column.context'),
      ],
      rows: rows.map((row): Cell[] => [
        { text: row.value ?? '', indicator: true, mono: true },
        { text: row.port ?? '', mono: true },
        { text: row.disposition ?? '' },
        { text: row.context ?? '' },
      ]),
      widths: [0.32, 0.1, 0.18, 0.4],
    },
  ]
}

/**
 * An application named with the tenant it was seen in, when there is one.
 */
function appAndInstance(row: CloudAppRow): string {
  const name = row.appName ?? ''
  const instance = row.instance ?? ''
  return qualified(name, instance)
}
