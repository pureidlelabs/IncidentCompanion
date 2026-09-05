/**
 * What a timeline write may carry, and what the server decides for itself.
 *
 * **Written from the defect.** Every create through the timeline dialog
 * answered 400, for two reasons at once, and neither suite could see either:
 * the client posted `provenance` (which `.strict()` refuses, because the field
 * is the server's) and `time` was declared `z.iso.datetime()` with no
 * `.optional()` - required, while its own docstring said "`defaultsNow` rather
 * than required". The intent lived in the comment and nowhere in the schema.
 *
 * Found by the browser tier pressing New activity. The unit tiers could not:
 * the client's body and the server's schema are each self-consistent, and only
 * a real request puts them against each other.
 *
 * **The schema half is asserted purely and the mapping through the
 * controller**, with the service stubbed - `whenItHappened` is where "no time
 * given" becomes a stamp plus a flag, and that is a decision worth pinning
 * separately from whatever the database does with it.
 */
import { UnprocessableEntityException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import { TimelineController } from './timeline.controller.js'
import type { CollectionService } from './collection.service.js'
import { actionWriteSchema, eventWriteSchema } from '../domain/entities/timeline.js'

const CASE = '00000000-0000-4000-8000-000000000001'
const SESSION = { user: { id: 'u-analyst' } } as never

/**
 * A stored row as the table holds it - no `ukcPhase`, because that is derived
 * on the way out and is not a column.
 */
const STORED = {
  id: 'row-1',
  kind: 'event',
  description: 'First contact',
  tactic: 'initial access',
  technique: 'T1598.004',
  time: new Date('2026-08-10T12:00:00Z'),
}

/** Records what the controller asked the service to write. */
function stubbed(row: Record<string, unknown> = STORED) {
  const create = vi.fn().mockResolvedValue(row)
  const get = vi.fn().mockResolvedValue({ kind: 'action' })
  const update = vi.fn().mockResolvedValue({ ok: true, row })
  const service = { create, get, update } as unknown as CollectionService
  return { service, create, get, update }
}

describe('what a timeline write may name', () => {
  it('takes an activity with only a description', () => {
    // The exact body the dialog sends once it stops naming the server's
    // fields. This was the 400.
    const parsed = actionWriteSchema.safeParse({ kind: 'action', description: 'Contained DC-01' })
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
  })

  it('takes an event with no time at all', () => {
    const parsed = eventWriteSchema.safeParse({ kind: 'event', description: 'First contact' })
    expect(parsed.success).toBe(true)
  })

  it('takes the empty string a cleared time control sends', () => {
    const parsed = eventWriteSchema.safeParse({
      kind: 'event',
      description: 'First contact',
      time: '',
    })
    expect(parsed.success).toBe(true)
  })

  it('still refuses a time that is neither empty nor a timestamp', () => {
    // The relaxation is for "not given", not for anything at all: a date field
    // filled with rubbish must not reach the column.
    const parsed = eventWriteSchema.safeParse({
      kind: 'event',
      description: 'First contact',
      time: 'yesterday',
    })
    expect(parsed.success).toBe(false)
  })

  it.each(['provenance', 'unreviewed', 'timeAssumed', 'id'])(
    'refuses %s, which is the server\u2019s to write',
    (name) => {
      const parsed = eventWriteSchema.safeParse({
        kind: 'event',
        description: 'First contact',
        [name]: name === 'unreviewed' || name === 'timeAssumed' ? true : 'typed',
      })
      expect(parsed.success).toBe(false)
    },
  )

  it('refuses a body with no kind to discriminate on', () => {
    // The union has nothing to pick an arm with, and the failure is the whole
    // write rather than a defaulted event.
    const parsed = eventWriteSchema.safeParse({ description: 'First contact' })
    expect(parsed.success).toBe(false)
  })
})

describe('when the server decides an entry happened', () => {
  it('stamps an absent time at now and says the stamp is assumed', async () => {
    const { service, create } = stubbed()
    await new TimelineController(service).create(
      CASE,
      { kind: 'action', description: 'Contained DC-01' },
      SESSION,
    )
    const written = create.mock.calls[0]?.[2] as { time: Date; timeAssumed: boolean }
    expect(written.timeAssumed).toBe(true)
    expect(written.time).toBeInstanceOf(Date)
    expect(Number.isNaN(written.time.getTime())).toBe(false)
  })

  it('treats an empty time exactly like an absent one', async () => {
    // Python read these as two different requests - absent stored
    // `time_assumed: false`, empty stored `true` - because `default_factory`
    // filled an absent field before `__post_init__` saw it. That is a dataclass
    // artefact, not a decision, and reproducing it would have kept a client
    // helper alive to tell them apart.
    const { service, create } = stubbed()
    await new TimelineController(service).create(
      CASE,
      { kind: 'action', description: 'Contained DC-01', time: '' },
      SESSION,
    )
    const written = create.mock.calls[0]?.[2] as { timeAssumed: boolean }
    expect(written.timeAssumed).toBe(true)
  })

  it('keeps a time the analyst gave, and does not call it assumed', async () => {
    const { service, create } = stubbed()
    await new TimelineController(service).create(
      CASE,
      { kind: 'event', description: 'First contact', time: '2026-08-10T12:00:00Z' },
      SESSION,
    )
    const written = create.mock.calls[0]?.[2] as { time: Date; timeAssumed: boolean }
    expect(written.timeAssumed).toBe(false)
    expect(written.time.toISOString()).toBe('2026-08-10T12:00:00.000Z')
  })

  it('applies the same rule when a patch clears the time', async () => {
    // `new Date('')` is an Invalid Date, which the column refuses - so the
    // patch path needed the rule too, not just create.
    const { service, update } = stubbed()
    await new TimelineController(service).update(CASE, 'row-1', { version: 1, time: '' }, SESSION)
    const written = update.mock.calls[0]?.[4] as { time: Date; timeAssumed: boolean }
    expect(written.timeAssumed).toBe(true)
    expect(Number.isNaN(written.time.getTime())).toBe(false)
  })

  it('leaves a patch that says nothing about time alone', async () => {
    const { service, update } = stubbed()
    await new TimelineController(service).update(
      CASE,
      'row-1',
      { version: 1, description: 'Contained DC-01' },
      SESSION,
    )
    const written = update.mock.calls[0]?.[4] as Record<string, unknown>
    expect('time' in written).toBe(false)
    expect('timeAssumed' in written).toBe(false)
  })

  it('writes only the field a patch named', async () => {
    // **The expensive one.** `.partial()` leaves a `.default()` intact, so a
    // patch of one column parsed into a whole row and the UPDATE wrote every
    // other defaulted column back at its default. Measured against the running
    // server before the fix: patching `description` alone returned `tactic: ''`
    // where it had been `initial access` and `severity: null` where it had been
    // `low`. Silent, and on every timeline edit.
    const { service, update } = stubbed()
    await new TimelineController(service).update(
      CASE,
      'row-1',
      { version: 1, description: 'Contained DC-01' },
      SESSION,
    )
    const written = update.mock.calls[0]?.[4] as Record<string, unknown>
    expect(Object.keys(written)).toEqual(['description'])
  })

  it('answers a create with the derived fields the reads carry', async () => {
    // **The response is what the client caches**, so a raw row blanks the
    // kill-chain column of the row just written until something refetches.
    // Measured 2026-08-10: list `delivery`/`in`, write null/null, list
    // `delivery`/`in` again. Nothing was lost and the answer was still wrong.
    const { service } = stubbed()
    const answer = (await new TimelineController(service).create(
      CASE,
      { kind: 'event', description: 'First contact' },
      SESSION,
    )) as unknown as Record<string, unknown>
    expect(answer['ukcPhase']).toBe('delivery')
  })

  it('answers a patch the same way', async () => {
    const { service } = stubbed()
    const answer = (await new TimelineController(service).update(
      CASE,
      'row-1',
      { version: 1, description: 'First contact' },
      SESSION,
    )) as unknown as Record<string, unknown>
    expect(answer['ukcPhase']).toBe('delivery')
  })

  it('refuses a patch that changes nothing', async () => {
    const { service } = stubbed()
    await expect(
      new TimelineController(service).update(CASE, 'row-1', { version: 1 }, SESSION),
    ).rejects.toBeInstanceOf(UnprocessableEntityException)
  })
})
