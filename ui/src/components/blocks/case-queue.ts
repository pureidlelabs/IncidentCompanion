import type { ComplianceRecord } from '@/api/compliance'
import type { Case } from '@/api/model'
import { missingExpected, shortLabel, type Specs } from '@/api/specs'
import { clockFace, hoursRemaining } from '@/lib/statutory-clock'

/**
 * The Picture screen's arithmetic: the statutory clocks, and what is
 * outstanding on the case in the order it costs to leave.
 *
 * **The clock is arithmetic and never an obligation.** Whether a breach is
 * reportable is the server's reading of the answers on the Compliance screen;
 * this counts hours against a stored stamp and says which stamp is missing.
 */

/**
 * The two stamps the Article 33 clock is read from.
 *
 * Named rather than taking the whole record, so a caller with the two fields -
 * a story, a header - is not obliged to build the other forty-eight.
 */
export type ClockStamps = Partial<
  Pick<ComplianceRecord, 'gdprAwareAt' | 'gdprAuthorityNotifiedAt'>
>

export interface ClockReading {
  /** The regime and article, as the analyst names it. */
  regime: string
  /** `+11:30`, `-72:00`, or an em dash where nothing has been recorded. */
  value: string
  /** One line saying what the reading rests on. */
  detail: string
  /** Past the deadline, which is the only reading that takes the danger edge. */
  danger: boolean
}

/**
 * The Article 33 clock: 72 hours from the recorded awareness.
 *
 * **Named, because it is the one reading that is true off this screen.** The
 * case header draws it beside the case's identity, and a second computation
 * there would be a second thing to keep agreeing with `gdpr_lens`. `clocksOf`
 * is this plus the two regimes there is no stamp for.
 *
 * **Overdue is not danger once the authority has been notified.** The deadline
 * still passed, and the reading still says so - what is gone is the thing the
 * edge was warning about.
 */
export function gdprClock(record: ClockStamps | undefined, now: number): ClockReading {
  const awareAt = typeof record?.gdprAwareAt === 'string' ? record.gdprAwareAt : ''
  const notified = typeof record?.gdprAuthorityNotifiedAt === 'string' ? record.gdprAuthorityNotifiedAt : ''
  const hours = hoursRemaining(awareAt, new Date(now))
  return {
    regime: 'GDPR art 33',
    value: clockFace(hours),
    detail:
      awareAt === ''
        ? 'starts when awareness is recorded'
        : notified === ''
          ? 'authority not recorded as notified'
          : 'authority recorded as notified',
    danger: hours !== null && hours < 0 && notified === '',
  }
}

/**
 * The three clocks, in the order they come due.
 *
 * NIS2 and DORA are drawn with no reading on purpose: this install stores no
 * stamp either can be measured from, and a clock that is absent from the strip
 * reads as a regime nobody is under.
 */
export function clocksOf(record: ComplianceRecord | undefined, now: number): ClockReading[] {
  return [
    gdprClock(record, now),
    {
      regime: 'NIS2 art 23',
      value: '\u2014',
      detail: 'no reading available yet',
      danger: false,
    },
    {
      regime: 'DORA 17-20',
      value: '\u2014',
      detail: 'no reading available yet',
      danger: false,
    },
  ]
}

/** What it costs to leave a row undone, lowest first. */
export const COST_PRECONDITION = 0
export const COST_STATUTORY = 1
export const COST_REPORT = 2
export const COST_COMPLETENESS = 3

export interface QueueRow {
  id: string
  /** What is outstanding. */
  label: string
  /** One line saying why it is worth doing, or how big it is. */
  sub: string
  /** The word on the control. */
  action: string
  /** Which screen answers it. */
  section: string
  cost: number
  /** Order within one cost. */
  tier: number
  /** How many rows this covers, so the biggest gap leads its tier. */
  magnitude: number
}

/** The rank a row sorts on: cost, then tier, then size, then the label. */
export function sortKey(row: QueueRow): [number, number, number, string] {
  return [row.cost, row.tier, -row.magnitude, row.label]
}

/**
 * A field name as it reads mid-sentence.
 *
 * The first letter is lowered only where the second already is, so `ATT&CK`
 * survives and `Severity` becomes `severity`.
 */
export function fieldLabel(label: string): string {
  const short = shortLabel(label)
  const second = short.charAt(1)
  return second !== '' && second === second.toLowerCase()
    ? short.charAt(0).toLowerCase() + short.slice(1)
    : short
}

/**
 * Everything this screen can see is outstanding, ranked.
 *
 * **Only what is derivable from the case.** A judgement an analyst has to
 * make - whether persistence was ruled out, whether the estate is clean - is
 * not in here, because a queue that guesses at those is a queue nobody trusts
 * the rest of.
 */
export function buildQueue(kase: Case, specs: Specs): QueueRow[] {
  const rows: QueueRow[] = []
  const events = kase.timeline.filter((entry) => entry.kind === 'event')

  if (!kase.detectedAt) {
    rows.push({
      id: 'detected-at',
      label: 'Set the detection time',
      sub: 'every elapsed figure in the case is measured from it',
      action: 'Set',
      section: 'overview',
      cost: COST_PRECONDITION,
      tier: 0,
      magnitude: 0,
    })
  }

  if (kase.timeline.length === 0) {
    rows.push({
      id: 'first-event',
      label: 'Capture the first event',
      sub: 'a line is enough',
      action: 'Capture',
      section: 'timeline',
      cost: COST_PRECONDITION,
      tier: 1,
      magnitude: 0,
    })
  }

  if (!kase.title) {
    rows.push({
      id: 'title',
      label: 'The case has no one-line description',
      sub: 'the report is titled from it',
      action: 'Write',
      section: 'overview',
      cost: COST_REPORT,
      tier: 0,
      magnitude: 0,
    })
  }

  if (events.length > 0) {
    for (const [field, count] of gapCounts(specs, kase)) {
      rows.push({
        id: `gap-${field}`,
        label: `${String(count)} ${count === 1 ? 'entry' : 'entries'} missing ${fieldLabel(labelFor(specs, field))}`,
        sub: `${String(count)} of ${String(events.length)} events`,
        action: `Review ${String(count)}`,
        section: 'timeline',
        cost: COST_COMPLETENESS,
        tier: 0,
        magnitude: count,
      })
    }

    const unreviewed = kase.timeline.filter((entry) => entry.unreviewed).length
    if (unreviewed > 0) {
      rows.push({
        id: 'unreviewed',
        label: `${String(unreviewed)} imported ${unreviewed === 1 ? 'event' : 'events'} unreviewed`,
        sub: `${String(unreviewed)} of ${String(kase.timeline.length)} entries`,
        action: 'Review',
        section: 'timeline',
        cost: COST_COMPLETENESS,
        tier: 1,
        magnitude: unreviewed,
      })
    }
  }

  return rows.sort((left, right) => {
    const a = sortKey(left)
    const b = sortKey(right)
    for (let at = 0; at < 3; at += 1) {
      const diff = Number(a[at]) - Number(b[at])
      if (diff !== 0) return diff
    }
    return a[3].localeCompare(b[3])
  })
}

/**
 * How many events lack each expected field.
 *
 * **A field nothing lacks is absent from the map, not zero.** The queue draws
 * one row per entry, and a row reading "0 entries missing severity" is a job
 * that does not exist.
 */
export function gapCounts(specs: Specs, kase: Case): Map<string, number> {
  const counts = new Map<string, number>()
  for (const entry of kase.timeline) {
    for (const field of missingExpected(specs.tiering, entry)) {
      counts.set(field, (counts.get(field) ?? 0) + 1)
    }
  }
  return counts
}

/** Every field any event could be expected to carry, for a name lookup. */
function labelFor(specs: Specs, field: string): string {
  for (const form of ['EVENT_FIELDS', 'CASE_FIELDS']) {
    const entry = specs.forms[form]?.fields.find(
      (one) => 'name' in one && one.name === field,
    )
    if (entry !== undefined && 'label' in entry) return entry.label
  }
  return field
}
