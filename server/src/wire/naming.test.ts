/**
 * That the server accepts the body the browser actually sends.
 */
import { describe, expect, it } from 'vitest'

import { camelKeys, toCamel } from './naming.js'

describe('the key conversion', () => {
  it.each([
    ['event_source', 'eventSource'],
    ['network_indicator_ids', 'networkIndicatorIds'],
    ['isolated_at', 'isolatedAt'],
    ['data_classification', 'dataClassification'],
    ['verified_publisher', 'verifiedPublisher'],
    ['ukc_override', 'ukcOverride'],
  ])('%s -> %s', (wire, expected) => {
    expect(toCamel(wire)).toBe(expected)
  })

  /**
   * **Idempotent, because not every caller snake-cases.**
   */
  it.each(['eventSource', 'id', 'tags', 'ip', 'systemId'])('leaves %s alone', (name) => {
    expect(toCamel(name)).toBe(name)
  })

  /**
   * A digit after the underscore is not a letter, and `p_1` reaching the schema
   * as `p_1` is the same 400 this file exists to stop.
   */
  it('lifts a digit as readily as a letter', () => {
    expect(toCamel('field_2_name')).toBe('field2Name')
  })
})

describe('the body conversion', () => {
  it('rewrites every key the client sends', () => {
    expect(
      camelKeys({
        kind: 'event',
        event_source: 'analyst observation',
        system_id: 'abc',
        network_indicator_ids: ['x', 'y'],
      }),
    ).toEqual({
      kind: 'event',
      eventSource: 'analyst observation',
      systemId: 'abc',
      networkIndicatorIds: ['x', 'y'],
    })
  })

  /** A bulk body is an array of rows, and each row needs the same treatment. */
  it('reaches inside an array of rows', () => {
    expect(camelKeys([{ account_name: 'a' }, { account_name: 'b' }])).toEqual([
      { accountName: 'a' },
      { accountName: 'b' },
    ])
  })

  it('converts keys and never values', () => {
    expect(camelKeys({ analysis_status: 'in progress', tags: 'patient_zero,crown-jewel' })).toEqual({
      analysisStatus: 'in progress',
      tags: 'patient_zero,crown-jewel',
    })
  })

  it.each([
    ['null', null],
    ['a string', 'plain'],
    ['a number', 7],
    ['a boolean', true],
  ])('passes %s through', (_name, value) => {
    expect(camelKeys(value)).toEqual(value)
  })
})
