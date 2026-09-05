/**
 * Which window a line falls under, attacked as "what can be pruned early".
 *
 * **The failure this guards is silent and permanent.** A line classed
 * `operational` is gone when the short window passes, and nothing reports what
 * was removed - so a misclassification is discovered by somebody asking, months
 * later, who deleted a case and finding nothing.
 *
 * So the cases here are not "does the map have entries". They are the specific
 * lines whose loss would matter, and the specific reason the obvious
 * implementation - splitting on `channel` - gets them wrong.
 */
import { describe, expect, it } from 'vitest'

import { CHANNEL_OF, installEvent } from '../db/schema/install-activity.js'
import type { InstallEvent } from './record.js'
import { retentionClassOf } from './retention-class.js'

describe('which retention window a line falls under', () => {
  /**
   * **Every one of these sits in a channel that reads "operational".**
   * Splitting on the channel would shorten them, which is the whole reason
   * this map exists as its own thing.
   */
  it.each([
    ['audit_retention_changed', 'who shortened the audit'],
    ['case_deleted', 'who destroyed a case'],
    ['data_exported', 'what left the install'],
    ['evidence_read', 'who opened the evidence'],
    ['audit_read', 'who read the audit'],
  ])('keeps %s, which answers: %s', (event) => {
    expect(retentionClassOf(event as InstallEvent)).toBe('audit')
  })

  /**
   * **And this is the check that the channel really is the wrong axis**, rather
   * than a claim in a docstring: at least one of those events lives in a
   * channel this app would otherwise treat as short-lived.
   */
  it('classes at least one line against its own channel', () => {
    const against = (['audit_retention_changed', 'case_deleted', 'data_exported'] as const).filter(
      (event) =>
        retentionClassOf(event) === 'audit' &&
        (CHANNEL_OF[event] === 'case' || CHANNEL_OF[event] === 'operations'),
    )
    expect(against.length, 'the channel would have been a safe axis after all').toBeGreaterThan(0)
  })

  it.each(['install_started', 'api_called', 'case_opened_live', 'rate_limited'])(
    'lets %s expire on the short window',
    (event) => {
      expect(retentionClassOf(event as InstallEvent)).toBe('operational')
    },
  )

  /**
   * **A refusal that names an account is evidence.** These answer *who tried
   * to reach what*, which is the question asked longest after the fact - and
   * three of the four sit beside `rate_limited`, which is short.
   */
  it.each(['sign_in_failed', 'access_denied', 'live_refused', 'account_locked'])(
    'keeps %s, which names who was refused',
    (event) => {
      expect(retentionClassOf(event as InstallEvent)).toBe('audit')
    },
  )

  /**
   * **A new event defaults to the long window.** The other default loses
   * evidence for whoever forgets to think about it; this one costs disk.
   */
  it('classes an event nobody listed as audit', () => {
    expect(retentionClassOf('an_event_added_next_week' as InstallEvent)).toBe('audit')
  })

  /** Every event the schema has is classed, so none of them is undefined. */
  it('classes every event in the vocabulary', () => {
    for (const event of installEvent.enumValues) {
      expect(['audit', 'operational'], event).toContain(retentionClassOf(event))
    }
  })
})
