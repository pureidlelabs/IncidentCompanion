import { describe, expect, it } from 'vitest'

import { campaignCompliance } from '@/fixtures/compliance'

import { clockFace, dayNumber, deadline, hoursRemaining, parseStamp } from './statutory-clock'

/**
 * Fixture-based, against numbers computed by hand. The clock face and
 * the day number are defined only here, so no other implementation confirms
 * them.
 *
 * `now` is injected everywhere. A test reading the wall clock would pass today
 * and go red on the day the demo fixture's deadline drifts out of the branch
 * it was written for.
 */

/** `campaign.json`: the controller became aware at this instant. */
const AWARE = '2026-07-24T21:35:41+00:00'

describe('the Article 33 deadline', () => {
  it('is 72 hours after awareness', () => {
    // gdpr_lens.NOTIFY_AUTHORITY_HOURS = 72; 24th 21:35:41 + 72h = 27th 21:35:41.
    expect(deadline(AWARE)?.toISOString()).toBe('2026-07-27T21:35:41.000Z')
  })

  it('is unknown while awareness is unrecorded, rather than counting from detection', () => {
    // The clock is stated, not assumed -- "becoming aware" is its own finding
    // and is routinely hours after the first alert.
    expect(deadline('')).toBeNull()
    expect(hoursRemaining('', new Date())).toBeNull()
  })

  it('is unknown rather than thrown for an unparseable stamp', () => {
    // `gdpr_aware_at` reaches the client from a CSV import and the API as well
    // as from a form.
    expect(deadline('not a date')).toBeNull()
  })

  it('reads an offsetless stamp as UTC, not as the viewer local time', () => {
    // Python replaces a naive tzinfo with UTC. `new Date('...T00:00:00')`
    // would read local, which moves the deadline by the viewer's offset.
    expect(parseStamp('2026-07-24T21:35:41')?.toISOString()).toBe(
      '2026-07-24T21:35:41.000Z',
    )
  })
})

describe('hours remaining', () => {
  it('is positive before the deadline and negative after it', () => {
    // Signed rather than clamped: overdue and due-right-now call for
    // different conversations with the regulator.
    expect(hoursRemaining(AWARE, new Date('2026-07-26T21:35:41Z'))).toBe(24)
    expect(hoursRemaining(AWARE, new Date('2026-07-30T21:35:41Z'))).toBe(-72)
  })

  it('has no clock to read on the campaign demo, which is a gap and not a pass', () => {
    /**
     * **This asserted an overdue headline clock and now asserts its absence.**
     * The property is real and the demo stopped carrying it: `gdprAwareAt` is
     * on `case_compliance`, `compliance.service` seeds a bare row per case,
     * and no demo in `server/src/demos/catalogue.ts` fills one - so the
     * Article 33 strip reads "starts when awareness is recorded" on every case
     * this app ships.
     *
     * **Written as an assertion rather than deleted**, so seeding a demo's
     * compliance turns this red and the overdue test comes back with it. The
     * alternative was to compute an awareness stamp from `now`, which is the
     * identity assertion this file's own history already records: `(aware +
     * 72h) - (aware + 96h) = -24h` holds for every value and reads the fixture
     * not at all.
     */
    expect(campaignCompliance.gdprAwareAt).toBeNull()
    expect(hoursRemaining(campaignCompliance.gdprAwareAt, new Date())).toBeNull()
  })
})

describe('the clock face', () => {
  it('signs the value and renders hours and minutes', () => {
    expect(clockFace(-72)).toBe('-72:00')
    expect(clockFace(11.5)).toBe('+11:30')
  })

  it('is an em dash when no clock is running', () => {
    expect(clockFace(null)).toBe('\u2014')
  })

  it('carries a rounded minute into the hour', () => {
    // The one deliberate divergence from `clock_face`, which computes the
    // hour and the minute independently and renders this as `+1:60`.
    expect(clockFace(1.999)).toBe('+2:00')
  })
})

describe('the day number', () => {
  it('counts the detection day as day 1', () => {
    expect(dayNumber(AWARE, null, new Date('2026-07-24T23:00:00Z'))).toBe(1)
    expect(dayNumber(AWARE, null, new Date('2026-07-29T21:35:41Z'))).toBe(6)
  })

  it('falls back to opened_at, so a late-opened case is not on day 1', () => {
    // A case opened three days after the detection it describes is on day 4.
    expect(dayNumber(null, '2026-07-24T00:00:00Z', new Date('2026-07-27T12:00:00Z'))).toBe(4)
  })

  it('is day 1 when the case carries neither stamp', () => {
    expect(dayNumber(null, null, new Date())).toBe(1)
  })
})
