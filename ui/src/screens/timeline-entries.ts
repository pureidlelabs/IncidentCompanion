import type { Case, TimelineAction, TimelineEntry, TimelineEvent } from '@/api/model'
import { isEvent } from '@/api/model'
import { toneFor, type SeverityTone } from '@/components/blocks/severity-badge'
import { campaignCase } from '@/fixtures/campaign'
import { ACTION_RAIL, actionClassOf } from '@/lib/action-class'
import { dayKeyOf, msOf } from '@/lib/case-time'
import { withinWindow, type TimeWindow } from '@/lib/time-window'

/**
 * The timeline's model: what paints a row's rail, what a run of identical
 * rows is, where the time holes are, and what the filter narrows to.
 *
 * Holds no component, so the screen file and its stories read one projection.
 */

/**
 * The rail's fill per severity.
 *
 * **An unrated event is a dashed edge, not a colour.** A missing severity is
 * work outstanding rather than a verdict of "none", and a filled grey says the
 * second thing.
 */
export const SEVERITY_RAIL: Readonly<Record<SeverityTone, string>> = {
  critical: 'bg-severity-critical',
  high: 'bg-severity-high',
  medium: 'bg-severity-medium',
  low: 'bg-severity-low',
  info: 'bg-severity-info',
  none: 'border-l border-dashed border-severity-none bg-transparent',
}

/** What paints one entry's rail: its severity, or its activity class. */
export function railOf(entry: TimelineEntry): string {
  return isEvent(entry)
    ? SEVERITY_RAIL[toneFor(entry.severity)]
    : ACTION_RAIL[actionClassOf(entry.actionType)]
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

/**
 * What makes two adjacent entries the same thing said twice.
 *
 * The day rather than the timestamp, and stored ids rather than resolved
 * names: a mailbox-by-mailbox import writes one row per recipient, minutes
 * apart, and they are one finding.
 */
function runKeyOf(entry: TimelineEntry): string | null {
  const day = dayKeyOf(entry.time)
  if (msOf(entry.time) === null) return null
  return JSON.stringify([
    day,
    entry.description,
    entry.kind,
    entry.severity ?? '',
    entry.tactic ?? '',
    entry.technique ?? '',
    entry.eventSource ?? '',
    entry.actionType ?? '',
    entry.ukcPhase ?? '',
    entry.systemId ?? '',
    entry.sourceSystemId ?? '',
    entry.accountIds,
    entry.tags ?? '',
  ])
}

/** A stretch of adjacent entries the analyst reads as one line. */
export interface TimelineRun {
  /** The entry that leads the run, and the only one drawn while it is folded. */
  lead: TimelineEntry
  /** Every entry in the run, the lead first. */
  members: readonly TimelineEntry[]
}

/**
 * Adjacent entries with the same key, in the order given.
 *
 * **Adjacency only, with no time threshold.** Two identical rows an hour apart
 * with something else between them are two findings, and folding them would
 * hide the something else.
 */
export function runsOf(entries: readonly TimelineEntry[]): TimelineRun[] {
  const runs: { lead: TimelineEntry; members: TimelineEntry[] }[] = []
  let key: string | null = null
  for (const entry of entries) {
    const own = runKeyOf(entry)
    const last = runs.at(-1)
    if (own !== null && own === key && last) {
      last.members.push(entry)
      continue
    }
    key = own
    runs.push({ lead: entry, members: [entry] })
  }
  return runs
}

/** `08:40 - 09:19`, earliest first whichever way the list is sorted. */
export function runSpanText(run: TimelineRun): string {
  const stamps = run.members.map((entry) => msOf(entry.time)).filter((at) => at !== null)
  if (stamps.length < 2) return ''
  const first = Math.min(...stamps)
  const last = Math.max(...stamps)
  return first === last ? '' : `${clock(first)} \u2013 ${clock(last)}`
}

function clock(at: number): string {
  const when = new Date(at)
  return `${String(when.getUTCHours()).padStart(2, '0')}:${String(when.getUTCMinutes()).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Gaps
// ---------------------------------------------------------------------------

/**
 * The hole between two rows that is worth drawing: one hour.
 *
 * The same floor the timeline graph's silence bands use, so the two screens
 * agree about what counts as quiet. It is a floor rather than a judgement -
 * the point of drawing it is that the analyst decides whether the quiet is
 * real or a collection failure.
 */
export const GAP_FLOOR_MS = 60 * 60 * 1000

/**
 * The gap in front of each rendered row, by row index.
 *
 * **Absolute, so it reads the same newest-first and oldest-first.** Index 0 is
 * never in the map: there is no row in front of the first one.
 */
export function gapsBefore(entries: readonly TimelineEntry[]): ReadonlyMap<number, number> {
  const gaps = new Map<number, number>()
  for (let at = 1; at < entries.length; at += 1) {
    const here = msOf(entries[at]?.time)
    const before = msOf(entries[at - 1]?.time)
    if (here === null || before === null) continue
    const span = Math.abs(before - here)
    if (span >= GAP_FLOOR_MS) gaps.set(at, span)
  }
  return gaps
}

// ---------------------------------------------------------------------------
// The filter
// ---------------------------------------------------------------------------

export interface TimelineFilter {
  /** `'event'`, `'action'`, or `''` for both. */
  kind: string
  /**
   * Narrowed by *when*. `null` is the whole case.
   *
   * The one dimension that is not a value an entry carries, and the one the
   * brush places: every other filter asks what an entry is.
   */
  window: TimeWindow | null
  /** Severity words, empty for all. A severity narrows events only. */
  severities: readonly string[]
  /** Kill chain phases, empty for all. */
  phases: readonly string[]
  /** Free text over what the row shows. */
  q: string
}

export const NO_TIMELINE_FILTER: TimelineFilter = {
  kind: '',
  window: null,
  severities: [],
  phases: [],
  q: '',
}

/** Every stamp the case can place, for the brush's track and its density. */
export function timesOf(entries: readonly TimelineEntry[]): number[] {
  return entries.map((entry) => msOf(entry.time)).filter((at): at is number => at !== null)
}

export function isTimelineFiltered(filter: TimelineFilter): boolean {
  return Boolean(
    filter.kind ||
      filter.window ||
      filter.severities.length ||
      filter.phases.length ||
      filter.q.trim(),
  )
}

/** How many dimensions are narrowing the list, for the clear control's count. */
export function activeCount(filter: TimelineFilter): number {
  return (
    (filter.kind ? 1 : 0) +
    (filter.window ? 1 : 0) +
    filter.severities.length +
    filter.phases.length +
    (filter.q.trim() ? 1 : 0)
  )
}

/** Everything a row says, for the search box to match over. */
function haystack(entry: TimelineEntry): string {
  return [
    entry.description,
    entry.severity ?? '',
    entry.ukcPhase ?? '',
    entry.tactic ?? '',
    entry.technique ?? '',
    entry.eventSource ?? '',
    entry.actionType ?? '',
    entry.tags ?? '',
  ]
    .join(' ')
    .toLowerCase()
}

/** AND across dimensions, OR within one. A severity filter excludes every
 *  activity, which has no severity to disagree with. */
export function matchesTimeline(entry: TimelineEntry, filter: TimelineFilter): boolean {
  if (filter.kind && entry.kind !== filter.kind) return false
  if (!withinWindow(msOf(entry.time), filter.window)) return false
  if (filter.severities.length) {
    if (!isEvent(entry)) return false
    if (!filter.severities.includes((entry.severity ?? '').trim().toLowerCase())) return false
  }
  if (filter.phases.length && !filter.phases.includes((entry.ukcPhase ?? '').trim())) return false
  const words = filter.q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length) {
    const hay = haystack(entry)
    if (!words.every((word) => hay.includes(word))) return false
  }
  return true
}

export function applyTimelineFilter(
  entries: readonly TimelineEntry[],
  filter: TimelineFilter,
): TimelineEntry[] {
  return entries.filter((entry) => matchesTimeline(entry, filter))
}

/**
 * What a chip in one dimension would leave, counted against its *siblings*.
 *
 * The dimension being counted is dropped from the filter first, so the chip
 * answers "and how many of those" rather than repeating its own total.
 */
export function countsFor(
  entries: readonly TimelineEntry[],
  filter: TimelineFilter,
  dimension: 'kind' | 'severity' | 'phase',
): ReadonlyMap<string, number> {
  const siblings: TimelineFilter = {
    ...filter,
    ...(dimension === 'kind' ? { kind: '' } : {}),
    ...(dimension === 'severity' ? { severities: [] } : {}),
    ...(dimension === 'phase' ? { phases: [] } : {}),
  }
  const counts = new Map<string, number>()
  for (const entry of entries) {
    if (!matchesTimeline(entry, siblings)) continue
    const value =
      dimension === 'kind'
        ? entry.kind
        : dimension === 'severity'
          ? isEvent(entry)
            ? (entry.severity ?? '').trim().toLowerCase()
            : ''
          : (entry.ukcPhase ?? '').trim()
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}

/** The phases this case holds, in the order they were first recorded. */
export function phasesOf(entries: readonly TimelineEntry[]): string[] {
  const seen: string[] = []
  for (const entry of entries) {
    const phase = (entry.ukcPhase ?? '').trim()
    if (phase && !seen.includes(phase)) seen.push(phase)
  }
  return seen
}

/** Newest first, or oldest first. Unparseable stamps sort last either way. */
export function sortEntries(
  entries: readonly TimelineEntry[],
  newestFirst: boolean,
): TimelineEntry[] {
  return [...entries].sort((left, right) => {
    const a = msOf(left.time)
    const b = msOf(right.time)
    if (a === null) return 1
    if (b === null) return -1
    return newestFirst ? b - a : a - b
  })
}

/**
 * The list with the named entries gone, whichever kind each one is.
 *
 * By id, never by the fields a run is grouped on: two entries a run folds
 * together share every one of those fields but not their id, and a bulk
 * delete naming one must not take the other with it.
 */
export function withoutTimelineEntries(
  entries: readonly TimelineEntry[],
  doomed: ReadonlySet<string>,
): TimelineEntry[] {
  return entries.filter((entry) => !doomed.has(entry.id))
}

// ---------------------------------------------------------------------------
// What one row offers
// ---------------------------------------------------------------------------

/**
 * One item on a row's menu, as a description rather than a handler.
 *
 * Pure and separate from the screen for the same reason
 * `screens/timeline-entries.ts` is: the decisions worth testing are which
 * items appear, what they are called, and what a value already in the filter
 * does to them. The screen binds the handlers and draws.
 */
export type TimelineRowAction =
  /** Open the create dialog for a row after this one. */
  | { id: string; kind: 'new-after'; noun: 'event' | 'action'; label: string }
  /** Narrow the list to a value this row carries. */
  | { id: string; kind: 'filter'; label: string; next: TimelineFilter }
  | { id: string; kind: 'copy'; label: string; text: string }
  | { id: string; kind: 'review'; label: string; unreviewed: boolean }
  | { id: string; kind: 'edit'; label: string }
  | { id: string; kind: 'delete'; label: string }

/** A run of items with a rule drawn above it. Empty groups are dropped. */
export type TimelineRowActionGroup = TimelineRowAction[]

export interface TimelineRowActionContext {
  filter: TimelineFilter
  /** The row has an edit handler. What withholds the writing verbs. */
  editable: boolean
  /** The row has a delete handler. A row can be editable and undeletable. */
  deletable: boolean
}

/**
 * What this row's menu offers, computed from the row.
 *
 * **Every item names a value the entry actually holds**, and a row already
 * inside the filter it would set offers nothing: a menu with dead items in it
 * teaches an analyst to stop opening menus, and greying one out is the same
 * lesson at half volume.
 *
 * **Narrower than the case screens', by one dimension.** The app's list
 * filters by entity as well, and this filter has no entity dimension to set --
 * so there is no "Filter to WKS-FIN01" here rather than one that does nothing.
 */
export function timelineRowActions(
  entry: TimelineEntry,
  ctx: TimelineRowActionContext,
): TimelineRowActionGroup[] {
  const groups: TimelineRowActionGroup[] = []

  if (ctx.editable) {
    groups.push([
      { id: 'new-event', kind: 'new-after', noun: 'event', label: 'New event after this' },
      { id: 'new-activity', kind: 'new-after', noun: 'action', label: 'New activity after this' },
    ])
  }

  const narrowing: TimelineRowAction[] = []
  const phase = (entry.ukcPhase ?? '').trim()
  if (phase && !ctx.filter.phases.includes(phase)) {
    narrowing.push({
      id: 'filter-phase',
      kind: 'filter',
      label: `Filter to ${phase}`,
      next: { ...ctx.filter, phases: [...ctx.filter.phases, phase] },
    })
  }
  // An activity has no severity dimension, so it offers no severity
  // narrowing - the same absence the row itself renders.
  const severity = isEvent(entry) ? (entry.severity ?? '').trim().toLowerCase() : ''
  if (severity && !ctx.filter.severities.includes(severity)) {
    narrowing.push({
      id: 'filter-severity',
      kind: 'filter',
      label: `Filter to ${severity}`,
      next: { ...ctx.filter, severities: [...ctx.filter.severities, severity] },
    })
  }
  if (narrowing.length > 0) groups.push(narrowing)

  const technique = isEvent(entry) ? entry.technique.trim() : ''
  if (technique) {
    groups.push([
      { id: 'copy-technique', kind: 'copy', label: `Copy ${technique}`, text: technique },
    ])
  }

  const editing: TimelineRowAction[] = []
  if (ctx.editable) {
    editing.push({
      id: 'review',
      kind: 'review',
      label: entry.unreviewed ? 'Mark reviewed' : 'Mark unreviewed',
      unreviewed: !entry.unreviewed,
    })
    editing.push({ id: 'edit', kind: 'edit', label: 'Edit in full' })
  }
  if (ctx.deletable) editing.push({ id: 'delete', kind: 'delete', label: 'Delete' })
  if (editing.length > 0) groups.push(editing)

  return groups
}

// ---------------------------------------------------------------------------
// Cases the stories mount
// ---------------------------------------------------------------------------

/**
 * The campaign demo with every collection these screens draw emptied.
 *
 * The case document itself is kept, so an empty story is a real case nobody
 * has written to yet rather than a document with no fields.
 */
export const EMPTY_CAMPAIGN: Case = {
  ...campaignCase,
  timeline: [],
  impact: [],
  casenotes: [],
  systems: [],
  accounts: [],
  networkIndicators: [],
  malware: [],
  cloudApps: [],
  evidence: [],
  actions: [],
  reports: [],
  reportBlocks: [],
}

/**
 * A timeline row's fields as they stand before the analyst fills any in.
 *
 * Written out rather than cast from the served form: the served descriptors
 * default the fields an analyst answers, not the arrays and flags the row is
 * drawn from, and a row without `accountIds` is `.map` on `undefined`.
 */
export const BLANK_EVENT: Omit<TimelineEvent, 'id'> = {
  kind: 'event',
  version: 1,
  description: '',
  time: '',
  eventSource: null,
  tactic: '',
  severity: null,
  technique: '',
  ukcOverride: '',
  ukcPhase: '',
  ukcCycle: '',
  sourceSystemId: null,
  systemId: null,
  accountIds: [],
  cloudAppIds: [],
  networkIndicatorIds: [],
  malwareIds: [],
  evidenceIds: [],
  methodIds: [],
  confidence: null,
  sourceTool: '',
  author: '',
  tags: '',
  notes: '',
  colour: '',
  hideFromGraph: false,
  followup: false,
  provenance: 'typed',
  unreviewed: false,
  timeAssumed: false,
}

export const BLANK_ACTION: Omit<TimelineAction, 'id'> = {
  kind: 'action',
  version: 1,
  description: '',
  time: '',
  actionType: '',
  author: '',
  systemId: null,
  accountIds: [],
  networkIndicatorIds: [],
  malwareIds: [],
  cloudAppIds: [],
  evidenceIds: [],
  methodIds: [],
  notes: '',
  colour: '',
  followup: false,
  provenance: 'typed',
  unreviewed: false,
  timeAssumed: false,
}
