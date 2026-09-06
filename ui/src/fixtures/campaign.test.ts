import { describe, expect, it } from 'vitest'

import { campaignCase } from './campaign'

/**
 * The fixture is the only thing standing between a story and the real API, so
 * it has to still be the shape the API sends. These fail when the wire shape
 * moves and the fixture was not recaptured - which is otherwise invisible
 * until a story renders blanks.
 */
describe('the campaign fixture', () => {
  it('carries the case the demo builder writes', () => {
    // **`reference`, not `id`.** The row has a uuid primary key and keeps the
    // analyst's reference beside it, so the stable thing to assert is the one
    // the seeder chooses rather than a key minted per install.
    expect(campaignCase.reference).toBe('DEMO-2026-031')
    expect(campaignCase.title).toBe('Major campaign')
  })

  it('is at the scale the large demo exists to test', () => {
    expect(campaignCase.timeline.length).toBe(88)
    expect(campaignCase.systems.length).toBe(30)
  })

  /**
   * **A value with the right characters and the wrong length reads as valid
   * everywhere except where it is used.** All twelve digests were 65
   * characters - one over sha256 - so `hashTypeOf` returned null for every one
   * and the indicator export silently carried no file hashes at all. Nothing
   * was red: the string is hex, the column renders it, and only a consumer
   * that measures it can tell. The seeder carried the same twelve.
   */
  it('carries digests a hash consumer can name an algorithm for', () => {
    const lengths = new Set(campaignCase.malware.map((entry) => entry.hash.length))
    expect(campaignCase.malware.length).toBeGreaterThan(0)
    expect([...lengths]).toEqual([64])
    expect(
      campaignCase.malware.every((entry) => /^[0-9a-f]{64}$/.test(entry.hash)),
      'a digest is lower-case hex, which is what a case-folded lookup assumes',
    ).toBe(true)
    // Twelve rows, twelve indicators: a duplicate would silently halve the
    // export while every row still rendered.
    expect(new Set(campaignCase.malware.map((entry) => entry.hash)).size).toBe(
      campaignCase.malware.length,
    )
  })

  it('carries the plural-report surface, which one report cannot exercise', () => {
    // The fixture held a single report for as long as the model allowed only
    // one, and kept holding it for two schema versions after that. A story
    // rendering the Report page against it could not show a second card, a
    // stage, a TLP that differs per document or a sent freeze - so the whole
    // surface was reachable from Python and from nothing the browser runs.
    expect(campaignCase.reports.length).toBeGreaterThan(1)
    expect(campaignCase.reports.some((r) => r.stage)).toBe(true)
  })

  it('files none of its reports, which the report surface needs and cannot stage', () => {
    // **Asserted as the gap it is.** `sentAt` is set by the freeze, and the
    // Node seeder writes none - so a sent report, its frozen copy and the
    // read-only screen that follows are reachable from no demo. Written this
    // way round so seeding one turns this red and the assertion above gets its
    // third clause back.
    expect(campaignCase.reports.every((r) => r.sentAt === null)).toBe(true)
  })

  it('reads back camelCase, so the naming boundary is exercised', () => {
    const first = campaignCase.timeline[0]!
    expect(first.eventSource).toBeTypeOf('string')
    expect(Object.keys(first)).not.toContain('event_source')
  })
})
