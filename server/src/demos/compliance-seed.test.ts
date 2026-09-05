/**
 * A demo that exists to show the regulatory surface actually carries one -
 * without it `compliance.service`'s bare row per case leaves the screen blank
 * and the statutory clocks unstarted on every case this app ships.
 *
 * **Asserted off `DEMO_CASES` rather than a seeded database**, so it holds
 * only that the definitions carry the fields and that the offsets put
 * awareness far enough back for a clock to have run out. The write itself is
 * `seeder.service.test.ts`.
 */
import { describe, expect, it } from 'vitest'

import { DEMO_CASES } from './catalogue.js'

const byReference = (reference: string) => {
  const demo = DEMO_CASES.find((one) => one.reference === reference)
  if (!demo) throw new Error(`no demo ${reference}`)
  return demo
}

describe('the demos that exist to show compliance', () => {
  it('carries a regulatory record on the two regulatory scenarios', () => {
    for (const reference of ['DEMO-2026-031', 'DEMO-2026-047']) {
      expect(byReference(reference).compliance).toBeDefined()
    }
  })

  it('puts the mass breach past the 72 hours, which is the reading it exists for', () => {
    const demo = byReference('DEMO-2026-047')
    const awareMinutes = demo.complianceMinutes?.gdprAwareAt
    expect(awareMinutes).toBeDefined()

    // Awareness sits `startedDaysAgo` back, plus its offset into the case. The
    // clock is overdue only if that lands more than 72 hours ago -- which is
    // exactly what a `startedDaysAgo` of 0 could never produce.
    const hoursAgo = demo.startedDaysAgo * 24 - awareMinutes! / 60
    expect(hoursAgo).toBeGreaterThan(72)
  })

  it('leaves the mass breach unnotified, so the strip has something to say', () => {
    expect(byReference('DEMO-2026-047').complianceMinutes?.gdprAuthorityNotifiedAt).toBeUndefined()
  })

  it('files the campaign inside the window, so both ends of the clock exist', () => {
    const demo = byReference('DEMO-2026-031')
    const aware = demo.complianceMinutes?.gdprAwareAt
    const filed = demo.complianceMinutes?.gdprAuthorityNotifiedAt
    expect(filed).toBeDefined()
    expect((filed! - aware!) / 60).toBeLessThan(72)
  })

  it('starts every demo in the past, because a case cannot happen tomorrow', () => {
    // `content.ts` says a demo "reads as an incident from this week"; the
    // seeder passed `new Date()`, so each one began at the instant it was
    // seeded and ran forward.
    for (const demo of DEMO_CASES) {
      expect(demo.startedDaysAgo).toBeGreaterThanOrEqual(0)
    }
    expect(DEMO_CASES.some((one) => one.startedDaysAgo > 0)).toBe(true)
  })
})
