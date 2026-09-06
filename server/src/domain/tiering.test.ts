/**
 * The gap tally the rail's attention chip is drawn from.
 *
 * **Both directions, because only one of them was covered.** The integration
 * cases in `cases.write.test.ts` seed a deliberately gapped event and a case
 * with no timeline at all - so `isGapped` returning **true for everything**
 * left the whole server suite green, measured. That defect puts a permanent
 * "N entries with open slots" chip on every case's rail, which is worse than a
 * missing one: it is a number an analyst cannot act on and cannot clear.
 *
 * **The client keeps its own per-row version, and this is not a second copy of
 * the rule.** `missingExpected` answers *which* fields are missing on the row
 * being edited; this answers *how many rows* need attention, without sending
 * the rows. Both read `TACTIC_LINKS`, the client through `/api/specs`, so the
 * vocabulary cannot drift - the emptiness test is what can, and it is what is
 * asserted here.
 */
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_TACTIC_LINKS,
  EVENT_ALWAYS_CLEAR,
  EVENT_CORE,
  expectedFields,
  isGapped,
} from './tiering.js'

/** Every field a `command and control` event is expected to carry, filled. */
function completeEvent(): Record<string, unknown> {
  return {
    kind: 'event',
    description: 'Beacon to 203.0.113.4',
    time: new Date('2026-07-24T10:00:00Z'),
    timeAssumed: false,
    tactic: 'command and control',
    severity: 'high',
    eventSource: 'EDR',
    technique: 'T1071',
    confidence: 'confirmed',
    sourceTool: 'Defender',
    systemId: 'sys-1',
    networkIndicatorIds: ['ind-1'],
  }
}

describe('expectedFields', () => {
  /**
   * **The names are spelled out rather than read from the constant**, and that
   * is not redundancy. `expect.arrayContaining([...DEFAULT_TACTIC_LINKS])`
   * passes trivially the day that constant is emptied - measured: emptying it
   * left this whole file green, which is the empty-set shape that reads as
   * coverage. The literals are what make the constant's *contents* the claim.
   */
  it('falls back to the default links for a tactic nobody measured', () => {
    // Some ATT&CK tactics appear in no demo case. An empty list would make
    // every such event complete by construction, which is the silent half of
    // getting this wrong.
    expect(expectedFields('resource development')).toEqual(
      expect.arrayContaining(['system_id', 'account_ids']),
    )
    expect(DEFAULT_TACTIC_LINKS).toEqual(['system_id', 'account_ids'])
  })

  it('falls back for an unset tactic, which is the ordinary state of a new line', () => {
    expect(expectedFields(undefined)).toEqual(
      expect.arrayContaining(['system_id', 'account_ids']),
    )
  })

  it('always includes the five a line is not a line without', () => {
    const core = ['description', 'time', 'tactic', 'severity', 'event_source']
    expect(EVENT_CORE).toEqual(core)
    for (const tactic of ['impact', 'exfiltration', undefined]) {
      expect(expectedFields(tactic)).toEqual(expect.arrayContaining(core))
    }
  })

  it('always includes the three that clear under every measured tactic', () => {
    // **Pinned by literal for `DEFAULT_TACTIC_LINKS`' reason**, and this one
    // was the sibling that kept the vacuous shape: emptying `EVENT_ALWAYS_CLEAR`
    // dropped three fields out of the gap tally with both files that hold the
    // rule still green - only a fixture-equality snapshot in `specs` noticed,
    // and someone re-measuring the tiering legitimately updates that.
    const clear = ['technique', 'confidence', 'source_tool']
    expect(EVENT_ALWAYS_CLEAR).toEqual(clear)
    expect(expectedFields('impact')).toEqual(expect.arrayContaining(clear))
  })

  it('reads the tactic-specific links, not only the default', () => {
    // `impact` carries `malware_ids`, which the default list does not - so a
    // lookup that quietly always returned the default would pass every
    // assertion above and undercount this one.
    expect(expectedFields('impact')).toContain('malware_ids')
    expect(expectedFields('impact')).not.toContain('account_ids')
  })
})

describe('isGapped', () => {
  it('says no for a complete event', () => {
    // **The direction nothing covered.** An `isGapped` that answered true for
    // everything left the server suite green, and every case would draw a
    // permanent attention chip.
    expect(isGapped(completeEvent())).toBe(false)
  })

  it('says yes when an expected field is empty', () => {
    expect(isGapped({ ...completeEvent(), severity: '' })).toBe(true)
  })

  it('says yes when an expected list is empty, not merely absent', () => {
    // An array is empty when it has no entries; anything else is empty when it
    // is falsy. `[]` is truthy, so one test cannot stand for both.
    expect(isGapped({ ...completeEvent(), networkIndicatorIds: [] })).toBe(true)
  })

  it('reads a field by its camel spelling as well as the wire one', () => {
    // The tiering names fields `system_id`; a Drizzle row holds `systemId`. A
    // lookup that read only the wire name would call every row gapped.
    const wireSpelled = { ...completeEvent() }
    delete wireSpelled['systemId']
    expect(isGapped({ ...wireSpelled, system_id: 'sys-1' })).toBe(false)
  })

  it('treats an assumed time as missing, though the column is never null', () => {
    // `time` is always set on a row; what makes it missing is that it was
    // inferred rather than recorded, which lives in a different column - so a
    // check that read `time` itself could never fire.
    expect(isGapped({ ...completeEvent(), timeAssumed: true })).toBe(true)
  })

  it('says yes when one of the always-clear fields is empty', () => {
    // The tier is "clears 80% under every measured tactic", not "optional".
    expect(isGapped({ ...completeEvent(), technique: '' })).toBe(true)
  })

  it('never counts an action, which has no tactic to look up', () => {
    // A task somebody did has no expectations. Counting it would put a number
    // on the rail that no screen can explain.
    expect(isGapped({ kind: 'action', task: 'Contain the host' })).toBe(false)
  })

  it('treats a row with no kind as an event', () => {
    // The column defaults to `event`, and a row read before that default
    // applies must not silently escape the tally.
    expect(isGapped({ description: '', tactic: 'impact' })).toBe(true)
  })
})
