/**
 * The alert mapper, attacked rather than demonstrated.
 */
import { describe, expect, it } from 'vitest'

import { SEVERITY } from '../../../domain/vocabularies.lists.js'
import type { RawIncident } from '../../../domain/incident-import.js'

import { PROTOTYPE_KEYS } from '../../../../test/prototype-keys.js'

import { alertToTimeline, entityRefsOf, normalizeTactic } from './alerts.js'

const INCIDENT = { title: 'Suspicious sign-in', id: 'inc-1' } as unknown as RawIncident

const alert = (properties: Record<string, unknown>, rest: Record<string, unknown> = {}) =>
  ({ properties, id: 'a-1', name: 'alert-1', ...rest })

describe('alertToTimeline', () => {
  it('maps the four severities Sentinel names', () => {
    for (const named of ['High', 'MEDIUM', 'low', 'Informational']) {
      expect(alertToTimeline(alert({ severity: named }), INCIDENT)?.fields.severity)
        .toBe(named.toLowerCase())
    }
  })

  /**
   * **`critical` is in the product's vocabulary and Sentinel does not send it**,
   * so the map is deliberately narrower than `SEVERITY`.
   */
  it('does not accept critical, which Sentinel has no severity for', () => {
    expect(SEVERITY).toContain('critical')
    expect(alertToTimeline(alert({ severity: 'critical' }), INCIDENT)?.fields.severity)
      .toBe('informational')
  })

  /**
   * **A key on `Object.prototype` is not a severity.**
   */
  it.each(PROTOTYPE_KEYS)(
    'reads %o as no severity at all', (named) => {
      const mapped = alertToTimeline(alert({ severity: named }), INCIDENT)
      expect(typeof mapped?.fields.severity).toBe('string')
      expect(SEVERITY).toContain(mapped?.fields.severity)
    },
  )

  it('falls back to the incident title, then to a fixed description', () => {
    expect(alertToTimeline(alert({}), INCIDENT)?.fields.description).toBe('Suspicious sign-in')
    expect(alertToTimeline(alert({}), {} as RawIncident)?.fields.description)
      .toBe('Sentinel alert')
  })

  it('prefers timeGenerated, then startTimeUtc, then a stamp of its own', () => {
    expect(alertToTimeline(alert({ timeGenerated: 'T1', startTimeUtc: 'T2' }), INCIDENT)
      ?.fields.time).toBe('T1')
    expect(alertToTimeline(alert({ startTimeUtc: 'T2' }), INCIDENT)?.fields.time).toBe('T2')
    expect(String(alertToTimeline(alert({}), INCIDENT)?.fields.time)).toMatch(/^\d{4}-/)
  })

  /**
   * **Server-owned fields are absent, not `false`.**
   */
  it('asserts neither provenance nor review state', () => {
    const fields = alertToTimeline(alert({}), INCIDENT)?.fields ?? {}
    expect(fields).not.toHaveProperty('provenance')
    expect(fields).not.toHaveProperty('unreviewed')
    expect(fields.confidence).toBeNull()
  })

  it('refuses a payload that is not an alert', () => {
    expect(alertToTimeline(null, INCIDENT)).toBeNull()
    expect(alertToTimeline('an alert', INCIDENT)).toBeNull()
    expect(alertToTimeline({ properties: 'no' }, INCIDENT)).toBeNull()
  })

  it('keys identity on the alert id, and falls back rather than colliding', () => {
    const byId = alertToTimeline(alert({ systemAlertId: 'sys-9' }), INCIDENT)?.identity
    const byName = alertToTimeline(alert({}), INCIDENT)?.identity
    expect(byId).toContain('sys-9')
    expect(byName).toContain('alert-1')
    expect(byId).not.toBe(byName)
  })
})

describe('normalizeTactic', () => {
  it('accepts the spellings Sentinel uses, ignoring case and separators', () => {
    for (const spelling of ['InitialAccess', 'initial access', 'Initial-Access', ' INITIAL_ACCESS '])
      expect(normalizeTactic(spelling)).toBe('initial access')
  })

  it('answers empty for a tactic the product does not have', () => {
    expect(normalizeTactic('Loitering')).toBe('')
  })

  /** The same prototype escape as the severity map, and the same consequence. */
  it.each(PROTOTYPE_KEYS)(
    'answers empty for %o', (named) => {
      expect(normalizeTactic(named)).toBe('')
    },
  )

  it('takes the first tactic the product recognises, not the first named', () => {
    const mapped = alertToTimeline(
      alert({ tactics: ['Loitering', 'Execution'] }), INCIDENT,
    )
    expect(mapped?.fields.tactic).toBe('execution')
  })
})

describe('entityRefsOf', () => {
  const byRef = new Map([['ref-h', 'h1'], ['ref-a', 'a1'], ['ref-a2', 'a2']])
  const candidates = new Map([
    ['h1', { collection: 'systems' }],
    ['a1', { collection: 'accounts' }],
    ['a2', { collection: 'accounts' }],
  ])

  it('links an alert naming nothing to every entity in its incident', () => {
    const refs = entityRefsOf(alert({}), INCIDENT, byRef, candidates)
    expect(refs.system).toBe('h1')
    expect(refs.accounts.sort()).toEqual(['a1', 'a2'])
  })

  it('narrows to the entities an alert does name', () => {
    const refs = entityRefsOf(alert({ entityIds: ['ref-a'] }), INCIDENT, byRef, candidates)
    expect(refs.system).toBeNull()
    expect(refs.accounts).toEqual(['a1'])
  })

  it('drops a named ref that resolved to nothing, rather than widening', () => {
    // The dangerous direction: falling back to "everything in the incident"
    // when a named ref is unknown links the alert to entities it never named.
    const refs = entityRefsOf(alert({ entityIds: ['ref-nope'] }), INCIDENT, byRef, candidates)
    expect(refs.accounts).toEqual([])
    expect(refs.system).toBeNull()
  })

  it('takes one system, so a two-host alert does not clone the row', () => {
    const twoHosts = new Map([['ref-h', 'h1'], ['ref-h2', 'h2']])
    const both = new Map([
      ['h1', { collection: 'systems' }],
      ['h2', { collection: 'systems' }],
    ])
    expect(entityRefsOf(alert({}), INCIDENT, twoHosts, both).system).toBe('h1')
  })
})
