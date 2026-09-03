import { describe, expect, it } from 'vitest'

import type { ActionEntry, Case, EvidenceEntry, ImpactEntry, TimelineEntry } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { campaignCompliance } from '@/fixtures/compliance'
import { specsFixture } from '@/fixtures/specs'
import { actionClassOf } from '@/lib/action-class'
import { clockOf, dayKeyOf, durationText, msOf, stampOf } from '@/lib/case-time'
import { clockFace, dayNumber, hoursRemaining } from '@/lib/statutory-clock'

import {
  buildCascade,
  cascadeRows,
  eventType,
  MAX_EXTRA,
  milestonesOf,
  momentSpace,
  silenceHeight,
} from './cascade-rows'
import { buildQueue, clocksOf, fieldLabel } from '@/components/blocks/case-queue'
import { matchesTask } from './action-rows'
import { matchesRecord } from './evidence-rows'
import { matchesData, shownColumns, volumeText } from './impact-rows'
import { coverageOf, phasesOf } from './killchain-phases'
import { newestFirst } from './notes-index'
import {
  countsFor,
  gapsBefore,
  matchesTimeline,
  NO_TIMELINE_FILTER,
  runSpanText,
  runsOf,
  sortEntries,
} from './timeline-entries'

/**
 * The case screens' arithmetic, attacked rather than demonstrated.
 *
 * Every case here is one the demo does not contain: an unparseable stamp, a
 * stored zero, a run whose members arrive newest first, a phase the vocabulary
 * publishes and the chain has no stage for. The demo is used only where the
 * claim is about the demo.
 */

const event = (over: Partial<TimelineEntry> = {}): TimelineEntry =>
  ({
    kind: 'event',
    id: `e-${String(Math.random())}`,
    description: 'thing happened',
    time: '2026-08-13T10:00:00.000Z',
    severity: 'high',
    ukcPhase: 'exploitation',
    technique: '',
    eventSource: '',
    tactic: '',
    systemId: null,
    sourceSystemId: null,
    accountIds: [],
    networkIndicatorIds: [],
    malwareIds: [],
    cloudAppIds: [],
    tags: '',
    hideFromGraph: false,
    ...over,
  }) as unknown as TimelineEntry

const action = (over: Partial<TimelineEntry> = {}): TimelineEntry =>
  ({
    kind: 'action',
    id: `a-${String(Math.random())}`,
    description: 'we did a thing',
    time: '2026-08-13T10:00:00.000Z',
    actionType: 'containment action',
    systemId: null,
    accountIds: [],
    networkIndicatorIds: [],
    malwareIds: [],
    cloudAppIds: [],
    tags: '',
    ...over,
  }) as unknown as TimelineEntry

describe('case-time', () => {
  it('returns a value it cannot parse unchanged, rather than Invalid Date', () => {
    expect(clockOf('not a stamp')).toBe('not a stamp')
    expect(dayKeyOf('')).toBe('')
    expect(stampOf('tomorrow')).toBe('tomorrow')
    expect(msOf('tomorrow')).toBeNull()
  })

  it('reads a stamp in UTC whatever the machine is set to', () => {
    // A local-time read would render this as 01:00 or 23:00 depending on where
    // the suite runs, and the same case would read two ways to two analysts.
    expect(clockOf('2026-08-13T00:00:00.000Z')).toBe('00:00')
    expect(dayKeyOf('2026-08-13T23:59:00.000Z')).toBe('2026-08-13')
  })

  it('never prints a span as zero once it has decided to draw one', () => {
    expect(durationText(30_000)).toBe('under a minute')
    expect(durationText(0)).toBe('under a minute')
  })

  it('drops the smaller unit when it is zero, and keeps it when it is not', () => {
    expect(durationText(2 * 3_600_000)).toBe('2h')
    expect(durationText(2 * 3_600_000 + 5 * 60_000)).toBe('2h 5m')
    expect(durationText(49 * 3_600_000)).toBe('2d 1h')
  })
})

describe('timeline runs and gaps', () => {
  it('folds only entries that are adjacent, never merely alike', () => {
    const same = { description: 'phish delivered', time: '2026-08-13T10:00:00.000Z' }
    const runs = runsOf([
      event(same),
      event({ description: 'something else', time: '2026-08-13T10:05:00.000Z' }),
      event({ ...same, time: '2026-08-13T10:10:00.000Z' }),
    ])
    expect(runs).toHaveLength(3)
  })

  it('does not fold across a day boundary, though every other field agrees', () => {
    const runs = runsOf([
      event({ description: 'beacon', time: '2026-08-13T23:59:00.000Z' }),
      event({ description: 'beacon', time: '2026-08-14T00:01:00.000Z' }),
    ])
    expect(runs).toHaveLength(2)
  })

  it('reads a run span earliest first, whichever order it was given in', () => {
    const late = event({ description: 'beacon', time: '2026-08-13T09:19:00.000Z' })
    const early = event({ description: 'beacon', time: '2026-08-13T08:40:00.000Z' })
    // Newest first is the screen's default, so the array's first member is the
    // run's *end*. Reading the ends off array positions printed `09:19 - 08:40`.
    expect(runSpanText({ lead: late, members: [late, early] })).toBe('08:40 \u2013 09:19')
  })

  it('draws no span for a run whose members share a minute', () => {
    const one = event({ time: '2026-08-13T08:40:00.000Z' })
    expect(runSpanText({ lead: one, members: [one, one] })).toBe('')
  })

  it('measures a gap the same size in either sort order', () => {
    const forwards = [
      event({ time: '2026-08-13T08:00:00.000Z' }),
      event({ time: '2026-08-13T12:00:00.000Z' }),
    ]
    const backwards = [...forwards].reverse()
    expect(gapsBefore(forwards).get(1)).toBe(4 * 3_600_000)
    expect(gapsBefore(backwards).get(1)).toBe(4 * 3_600_000)
  })

  it('draws nothing for a gap under the floor, and something at it', () => {
    const at = (minutes: number) =>
      event({ time: new Date(Date.parse('2026-08-13T08:00:00.000Z') + minutes * 60_000).toISOString() })
    expect(gapsBefore([at(0), at(59)]).has(1)).toBe(false)
    expect(gapsBefore([at(0), at(60)]).has(1)).toBe(true)
  })

  it('skips a pair it cannot measure rather than drawing a gap of NaN', () => {
    expect(gapsBefore([event({ time: 'unknown' }), event()]).size).toBe(0)
  })
})

describe('the timeline filter', () => {
  it('excludes every activity when a severity is chosen', () => {
    // An activity has no severity, so "which of these are high" is a question
    // it cannot answer either way. Including it answers a different question.
    const filter = { ...NO_TIMELINE_FILTER, severities: ['high'] }
    expect(matchesTimeline(event({ severity: 'high' }), filter)).toBe(true)
    expect(matchesTimeline(action(), filter)).toBe(false)
  })

  it('counts a chip against its siblings rather than the whole case', () => {
    const entries = [
      event({ severity: 'high', ukcPhase: 'exploitation' }),
      event({ severity: 'high', ukcPhase: 'impact' }),
      event({ severity: 'low', ukcPhase: 'exploitation' }),
    ]
    const scoped = countsFor(entries, { ...NO_TIMELINE_FILTER, phases: ['exploitation'] }, 'severity')
    expect(scoped.get('high')).toBe(1)
    // Its own dimension is dropped first, so the chip does not count itself out.
    const own = countsFor(entries, { ...NO_TIMELINE_FILTER, severities: ['low'] }, 'severity')
    expect(own.get('high')).toBe(2)
  })

  it('narrows on every search word rather than any of them', () => {
    const entry = event({ description: 'phish delivered to finance' })
    expect(matchesTimeline(entry, { ...NO_TIMELINE_FILTER, q: 'phish finance' })).toBe(true)
    expect(matchesTimeline(entry, { ...NO_TIMELINE_FILTER, q: 'phish backups' })).toBe(false)
  })

  it('sorts an unparseable stamp last in both directions', () => {
    const broken = event({ time: 'unknown' })
    const good = event({ time: '2026-08-13T10:00:00.000Z' })
    expect(sortEntries([broken, good], true).at(-1)).toBe(broken)
    expect(sortEntries([broken, good], false).at(-1)).toBe(broken)
  })

  it('files an action word the map does not name under the fallback class', () => {
    expect(actionClassOf('escalation')).toBe('response')
    expect(actionClassOf('remediation action')).toBe('mitigation')
    // `response` is both a real class and the fallback, which is what makes
    // this assertion not obvious: an imported or
    // hand-typed action type renders as a notification, and the gallery used
    // to answer `investigation` here while the app answered `response`.
    expect(actionClassOf('something nobody wrote down')).toBe('response')
    expect(actionClassOf(undefined)).toBe('response')
  })
})

describe('the impact table', () => {
  it('counts a stored zero as filled, so its column appears', () => {
    // "Zero data subjects" is an answer and a blank is not. A falsy test
    // collapses the two and the column never appears for the record with one.
    const rows = [{ subjectCount: 0, recordCount: null, category: '', systemId: '' }]
    expect(shownColumns(rows as never)).toContain('subjectCount')
    expect(shownColumns(rows as never)).not.toContain('recordCount')
  })

  it('does not count whitespace as a value', () => {
    expect(shownColumns([{ category: '   ' }] as never)).not.toContain('category')
  })

  it('scales a byte count and leaves an absent one empty', () => {
    expect(volumeText(6_100_000_000)).toBe('6.1 GB')
    expect(volumeText(0)).toBe('')
    expect(volumeText(null)).toBe('')
  })
})

describe('the statutory clock', () => {
  const now = Date.parse('2026-08-19T09:00:00.000Z')
  const at = new Date(now)

  it('has no reading at all until awareness is recorded', () => {
    expect(hoursRemaining('', at)).toBeNull()
    expect(clockFace(null)).toBe('\u2014')
    expect(clocksOf(campaignCompliance, now)[0]?.detail).toBe(
      'starts when awareness is recorded',
    )
  })

  it('runs negative past the deadline rather than clamping to zero', () => {
    const hours = hoursRemaining('2026-08-14T00:00:00.000Z', at)
    expect(hours).toBeLessThan(0)
    expect(clockFace(hours)).toMatch(/^-/)
  })

  it('never prints sixty minutes, whichever side of the deadline it is on', () => {
    // Rounding hours and minutes separately printed `-0:60`.
    expect(clockFace(-0.999)).toBe('-1:00')
    expect(clockFace(0.999)).toBe('+1:00')
  })

  it('stops calling a late notification dangerous once it is recorded', () => {
    const late = { ...campaignCompliance, gdprAwareAt: '2026-08-14T00:00:00.000Z' }
    expect(clocksOf(late, now)[0]?.danger).toBe(true)
    expect(
      clocksOf({ ...late, gdprAuthorityNotifiedAt: '2026-08-17T06:00:00.000Z' }, now)[0]?.danger,
    ).toBe(false)
  })

  it('numbers the first day 1, and never zero or negative', () => {
    const kase = { ...campaignCase, detectedAt: '2026-08-19T08:00:00.000Z' } as Case
    expect(dayNumber(kase.detectedAt, kase.openedAt, at)).toBe(1)
    // A detection stamp in the future is a typo, not a day zero.
    expect(dayNumber('2026-09-01T00:00:00.000Z', kase.openedAt, at)).toBe(1)
  })
})

describe('the open-item queue', () => {
  it('offers no completeness row on a case with no events', () => {
    // "83 events missing severity" on a case with no events is arithmetic
    // rather than a job, and it would outrank the two rows that are.
    const rows = buildQueue({ ...campaignCase, timeline: [], title: 'x' }, specsFixture)
    expect(rows.every((row) => !row.id.startsWith('gap-'))).toBe(true)
  })

  it('puts a precondition above everything, whatever it is worth', () => {
    const rows = buildQueue({ ...campaignCase, detectedAt: null }, specsFixture)
    expect(rows[0]?.id).toBe('detected-at')
  })

  it('leads a tier with the biggest gap rather than the alphabet', () => {
    const rows = buildQueue({ ...campaignCase, title: 'x' }, specsFixture).filter((row) =>
      row.id.startsWith('gap-'),
    )
    const sizes = rows.map((row) => row.magnitude)
    expect(sizes).toEqual([...sizes].sort((left, right) => right - left))
  })

  it('lowers a field name only where lowering it is right', () => {
    expect(fieldLabel('Severity')).toBe('severity')
    // A name that is an initialism keeps its case; lowering it makes it a
    // different word.
    expect(fieldLabel('ATT&CK technique')).toBe('ATT&CK technique')
  })
})

describe('kill chain coverage', () => {
  it('keeps the vocabulary member the chain has no stage for out of the rows', () => {
    expect(phasesOf(specsFixture)).not.toContain('policy violation')
    expect(phasesOf(specsFixture)).toHaveLength(18)
  })

  it('names an entry filed there as an absence rather than losing it', () => {
    const kase = {
      ...campaignCase,
      timeline: [event({ ukcPhase: 'policy violation', description: 'USB policy breach' })],
    }
    const coverage = coverageOf(kase, specsFixture)
    // The names, not the count: the door hands the analyst the entries, and a
    // length alone would pass on five copies of one entry.
    expect(coverage.notAPhase).toEqual(['USB policy breach'])
    expect(coverage.phases.every((phase) => !phase.observed)).toBe(true)
  })

  it('does not count an entry the analyst hid from the graph', () => {
    const kase = {
      ...campaignCase,
      timeline: [event({ hideFromGraph: true, description: 'Duplicate alert' })],
    }
    const coverage = coverageOf(kase, specsFixture)
    expect(coverage.hidden).toEqual(['Duplicate alert'])
    expect(coverage.phases.every((phase) => phase.entries === 0)).toBe(true)
  })

  it('calls a phase thin only when its evidence is one host', () => {
    const [first, second] = campaignCase.systems
    const kase = {
      ...campaignCase,
      timeline: [
        event({ ukcPhase: 'exploitation', systemId: first?.id ?? '' }),
        event({ ukcPhase: 'impact', systemId: first?.id ?? '' }),
        event({ ukcPhase: 'impact', systemId: second?.id ?? '' }),
      ],
    }
    const coverage = coverageOf(kase, specsFixture)
    expect(coverage.phases.find((one) => one.phase === 'exploitation')?.thin).toBe(true)
    expect(coverage.phases.find((one) => one.phase === 'impact')?.thin).toBe(false)
  })

  it('leaves every host unplaced when nothing phased names one', () => {
    const coverage = coverageOf({ ...campaignCase, timeline: [] }, specsFixture)
    expect(coverage.unplaced).toHaveLength(campaignCase.systems.length)
    expect(coverage.hostTotal).toBe(campaignCase.systems.length)
  })

  it('reads the demo as reaching some phases and missing others', () => {
    const coverage = coverageOf(campaignCase, specsFixture)
    const reached = coverage.phases.filter((phase) => phase.observed).length
    expect(reached).toBeGreaterThan(0)
    expect(reached).toBeLessThan(coverage.phases.length)
  })
})

describe('the cascade', () => {
  it('blanks a case name out of a description so two hosts are one kind', () => {
    expect(eventType('PsExec to WKS-01', ['WKS-01'])).toBe('PsExec to \u2026')
    // A short name is left alone: blanking `SRV` would eat the word inside
    // every longer one.
    expect(eventType('PsExec to SRV', ['SRV'])).toBe('PsExec to SRV')
  })

  it('splits a run wherever the case went quiet, however alike the members', () => {
    const kase = {
      ...campaignCase,
      systems: [],
      accounts: [],
      timeline: [
        event({ description: 'beacon', time: '2026-08-13T08:00:00.000Z' }),
        event({ description: 'beacon', time: '2026-08-13T08:30:00.000Z' }),
        event({ description: 'beacon', time: '2026-08-13T12:00:00.000Z' }),
      ],
    } as Case
    expect(buildCascade(kase)).toHaveLength(2)
  })

  it('draws a silence between two moments and never before the first', () => {
    const runs = buildCascade({
      ...campaignCase,
      systems: [],
      accounts: [],
      timeline: [
        event({ description: 'one', time: '2026-08-13T08:00:00.000Z' }),
        event({ description: 'two', time: '2026-08-13T18:00:00.000Z' }),
      ],
    })
    const rows = cascadeRows(runs)
    expect(rows[0]?.kind).toBe('day')
    expect(rows.filter((row) => row.kind === 'silence')).toHaveLength(1)
  })

  it('keeps the tallest silence on the screen however long the case is', () => {
    const week = 7 * 24 * 3_600_000
    expect(silenceHeight(week, week)).toBeLessThanOrEqual(150)
    expect(silenceHeight(3_600_000, week)).toBeGreaterThanOrEqual(26)
    // The root is what keeps the two comparable: linear, an hour against a
    // week is under a pixel.
    expect(silenceHeight(3_600_000, week)).toBeLessThan(silenceHeight(week, week))
  })

  it('draws the band across midnight as well as the day rule', () => {
    // The attack: a gap that is *both* a silence and a day change. Written as
    // `if day else if silence`, the rule swallows the band and eleven quiet
    // hours read as the next row down.
    const runs = buildCascade({
      ...campaignCase,
      systems: [],
      accounts: [],
      timeline: [
        event({ description: 'one', time: '2026-08-13T22:00:00.000Z' }),
        event({ description: 'two', time: '2026-08-14T09:00:00.000Z' }),
      ],
    })
    const rows = cascadeRows(runs)
    expect(rows.filter((row) => row.kind === 'silence')).toHaveLength(1)
    expect(rows.filter((row) => row.kind === 'day')).toHaveLength(2)
    // The band is the interval, so it is drawn before the day it lands in.
    const band = rows.findIndex((row) => row.kind === 'silence')
    const second = rows.map((row) => row.kind).lastIndexOf('day')
    expect(band).toBeLessThan(second)
  })

  it('spaces two moments by the root of the interval, and charges a silence once', () => {
    // Vertical distance is elapsed time, square-rooted -- the drawing's whole
    // claim, and the screen no longer says so in words. A constant here
    // renders identically to a rate that says nothing.
    expect(momentSpace(0)).toBe(0)
    expect(momentSpace(60_000)).toBeCloseTo(Math.sqrt(60), 5)
    expect(momentSpace(3_600_000)).toBeCloseTo(60, 5)
    // Root, not linear: an hour is 60x a minute and draws under 8x the space.
    expect(momentSpace(3_600_000)).toBeLessThan(momentSpace(60_000) * 10)
    expect(momentSpace(3_600_000)).toBeGreaterThan(momentSpace(60_000))
    // A week would otherwise be 777px of nothing between two cards.
    expect(momentSpace(7 * 24 * 3_600_000)).toBe(MAX_EXTRA)

    const runs = buildCascade({
      ...campaignCase,
      systems: [],
      accounts: [],
      timeline: [
        event({ description: 'one', time: '2026-08-13T08:00:00.000Z' }),
        event({ description: 'two', time: '2026-08-13T08:20:00.000Z' }),
        event({ description: 'three', time: '2026-08-13T18:00:00.000Z' }),
      ],
    })
    const moments = cascadeRows(runs).filter((row) => row.kind === 'moment')
    expect(moments[0]?.spaceBefore).toBe(0)
    expect(moments[1]?.spaceBefore).toBeCloseTo(Math.sqrt(1200), 5)
    // The band already draws that interval; charged twice, a detection and the
    // event that raised it sit a canyon apart.
    expect(moments[2]?.spaceBefore).toBe(0)
  })

  it('files a milestone at the moment it happened, not at either end', () => {
    const runs = buildCascade({
      ...campaignCase,
      systems: [],
      accounts: [],
      timeline: [
        event({ description: 'one', time: '2026-08-13T08:00:00.000Z' }),
        event({ description: 'two', time: '2026-08-13T18:00:00.000Z' }),
      ],
    })
    const at = (iso: string) => msOf(iso) ?? 0
    const rows = cascadeRows(runs, {
      milestones: [
        { key: 'early', label: 'Early', at: at('2026-08-13T06:00:00.000Z') },
        { key: 'detected', label: 'Detected', at: at('2026-08-13T12:00:00.000Z') },
        { key: 'late', label: 'Late', at: at('2026-08-14T06:00:00.000Z') },
      ],
    })
    const order = rows.map((row) => (row.kind === 'milestone' ? row.key : row.kind))
    expect(order.indexOf('early')).toBeLessThan(order.indexOf('moment'))
    // Inside the quiet stretch it measures against, never above the band: a
    // detection at the end of a silence otherwise sorts above the silence.
    expect(order.indexOf('silence')).toBeLessThan(order.indexOf('detected'))
    expect(order.indexOf('detected')).toBeLessThan(order.lastIndexOf('moment'))
    // Nothing came after it, so it is the last row rather than dropped.
    expect(order.lastIndexOf('late')).toBe(order.length - 1)
  })

  it('offers no milestone the case never stamped', () => {
    // Every demo ships all four null, so a rule drawn at epoch zero is the
    // failure this is written against.
    expect(milestonesOf(campaignCase)).toEqual([])
    expect(
      milestonesOf({ ...campaignCase, containedAt: '2026-08-16T09:40:00.000Z' }).map(
        (one) => one.key,
      ),
    ).toEqual(['contained'])
  })
})

describe('notes', () => {
  it('sorts a note with an unreadable stamp oldest, never newest', () => {
    const notes = [
      { id: 'a', createdAt: 'whenever' },
      { id: 'b', createdAt: '2026-08-13T10:00:00.000Z' },
    ]
    expect(newestFirst(notes as never).at(-1)?.id).toBe('a')
  })

  it('reads the newest note first', () => {
    const notes = [
      { id: 'old', createdAt: '2026-08-13T10:00:00.000Z' },
      { id: 'new', createdAt: '2026-08-14T10:00:00.000Z' },
    ]
    expect(newestFirst(notes as never)[0]?.id).toBe('new')
  })
})


/** An action carrying a value in each of the six fields the box used to read. */
const task = (over: Partial<ActionEntry> = {}): ActionEntry =>
  ({
    ...campaignCase.actions[0]!,
    task: 'Rebuild the domain controller',
    taskType: 'containment',
    status: 'blocked',
    assignee: 'Okonkwo',
    dateDue: '2026-09-30',
    tags: 'ransomware',
    ...over,
  })

/**
 * **The toolbar's badge names one column, and the box searches that column.**
 *
 * The defect these are written against: every one of these boxes drew a badge
 * naming a single column and matched over five or six fields, so an assignee,
 * a disposition or a tag was found under a label promising the task, the data
 * or the name. Each screen gets its own, because each has its own haystack and
 * a shared test would leave five of the six unattacked.
 *
 * Written from the attack rather than the intention: the assertion that
 * matters is the negative one - a value that exists in another column of the
 * same row is not a match.
 */
describe('the actions search reads the Task column', () => {
  it('matches a word in the task', () => {
    expect(matchesTask(task(), 'controller')).toBe(true)
  })

  it.each([
    ['Type', 'containment'],
    ['Status', 'blocked'],
    ['Assignee', 'okonkwo'],
    ['Due', '2026-09-30'],
    ['a tag, which is no column at all', 'ransomware'],
  ])('refuses a value that is only in %s', (_column, term) => {
    expect(matchesTask(task(), term)).toBe(false)
  })

  it('is AND across terms, so a second word narrows rather than widens', () => {
    expect(matchesTask(task(), 'rebuild controller')).toBe(true)
    expect(matchesTask(task(), 'rebuild mailbox')).toBe(false)
  })

  it('leaves every row when the query is blank', () => {
    expect(campaignCase.actions.every((one) => matchesTask(one, '   '))).toBe(true)
  })
})

/** A record carrying a value in each of the fields the box used to read. */
const record = (over: Partial<EvidenceEntry> = {}): EvidenceEntry =>
  ({
    ...campaignCase.evidence[0]!,
    name: 'Domain controller triage package',
    type: 'memory dump',
    location: 'evidence-share/dc01',
    dataClassification: 'restricted',
    tags: 'ransomware',
    ...over,
  })

describe('the evidence search reads the Name column', () => {
  it('matches a word in the name', () => {
    expect(matchesRecord(record(), 'triage')).toBe(true)
  })

  it.each([
    ['Type', 'memory'],
    ['Location', 'evidence-share'],
    ['Data classification', 'restricted'],
    ['a tag, which is no column at all', 'ransomware'],
  ])('refuses a value that is only in %s', (_column, term) => {
    expect(matchesRecord(record(), term)).toBe(false)
  })

  it('is AND across terms, so a second word narrows rather than widens', () => {
    expect(matchesRecord(record(), 'domain package')).toBe(true)
    expect(matchesRecord(record(), 'domain mailbox')).toBe(false)
  })

  it('leaves every row when the query is blank', () => {
    expect(campaignCase.evidence.every((one) => matchesRecord(one, '   '))).toBe(true)
  })
})

/** An impact row carrying a value in each of the fields the box used to read. */
const impact = (over: Partial<ImpactEntry> = {}): ImpactEntry =>
  ({
    ...campaignCase.impact[0]!,
    label: 'Payroll export',
    category: 'financial records',
    disposition: 'exfiltrated',
    notes: 'copied to an external host',
    tags: 'ransomware',
    ...over,
  })

describe('the impact search reads the Data column', () => {
  it('matches a word in the data name', () => {
    expect(matchesData(impact(), 'payroll')).toBe(true)
  })

  it.each([
    ['Category', 'financial'],
    ['What happened', 'exfiltrated'],
    ['Notes, which is no column at all', 'external'],
    ['a tag, which is no column at all', 'ransomware'],
  ])('refuses a value that is only in %s', (_column, term) => {
    expect(matchesData(impact(), term)).toBe(false)
  })

  it('is AND across terms, so a second word narrows rather than widens', () => {
    expect(matchesData(impact(), 'payroll export')).toBe(true)
    expect(matchesData(impact(), 'payroll mailbox')).toBe(false)
  })

  it('leaves every row when the query is blank', () => {
    expect(campaignCase.impact.every((one) => matchesData(one, '   '))).toBe(true)
  })
})
