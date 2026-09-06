import { describe, expect, it } from 'vitest'

import { specsFixture } from '@/fixtures/specs'

import { CARD_FIELD_LIMIT, cardContentOf, nameFieldOf, referenceCount, toneOf } from './entityCard'
import { ENTITY_TARGETS, formForCollection } from './entityTargets'
import type { FormSpec } from './specs'

/**
 * The recipe, over the six forms it has to hold for.
 *
 * These are the assertions that stop the card quietly becoming six hardcoded
 * field lists: the rules are checked against every target's *served* form, so
 * a seventh collection or a renamed field is a failure here rather than an
 * empty card nobody looks at twice.
 */

function form(target: string): FormSpec {
  const collection = ENTITY_TARGETS[target]?.collection
  const found = collection ? formForCollection(specsFixture, collection) : undefined
  if (!found) throw new Error(`no form for ${target}`)
  return found
}

describe('the name the card leads with', () => {
  it('is the field an analyst names the row by, on every target', () => {
    const cases: [string, Record<string, unknown>, string][] = [
      ['system', { hostname: 'WKS-FIN01', systemType: 'workstation' }, 'hostname'],
      ['account', { accountName: 'p.zero@meridian.example' }, 'accountName'],
      ['malware', { filename: 'rclone.exe', family: 'rclone' }, 'filename'],
      ['cloud_app', { appName: 'RemoteHands', publisher: 'x' }, 'appName'],
      ['evidence', { name: 'KAPE triage', location: '/x' }, 'name'],
      ['network', { type: 'ipv4', value: '185.220.101.43' }, 'value'],
    ]
    for (const [target, row, expected] of cases) {
      expect(nameFieldOf(form(target), row)?.name, target).toBe(expected)
    }
  })

  /**
   * **The kind never names the row.** An indicator leads with its `value`,
   * whatever kind it is.
   */
  it('never leads an indicator with its kind', () => {
    expect(nameFieldOf(form('network'), { type: 'domain', value: 'mega.io' })?.name).toBe('value')
  })
})

describe('the chip', () => {
  it('is the served tone for the served field, and nothing when unmeasured', () => {
    expect(toneOf(specsFixture, form('system'), { verdict: 'compromised' })).toMatchObject({
      field: 'verdict',
      label: 'Verdict',
      value: 'compromised',
      tone: { tone: 'critical', fill: 'solid' },
    })
    // `benign` keeps the yellow and goes hollow: the indicator showed up and
    // has an explanation, which is not the same as nothing being there.
    expect(toneOf(specsFixture, form('network'), { disposition: 'benign' })?.tone).toEqual({
      tone: 'low',
      fill: 'hollow',
    })
    // `ACCOUNT_FIELDS` declares no toned field: no chip rather than a neutral one.
    expect(toneOf(specsFixture, form('account'), { accountName: 'x' })).toBeUndefined()
    expect(toneOf(specsFixture, form('system'), { verdict: 'something new' })).toBeUndefined()
  })
})

describe('the body', () => {
  it('drops the name, the references, the tags and the toned field', () => {
    const content = cardContentOf(specsFixture, form('malware'), {
      filename: 'rclone.exe',
      family: 'rclone',
      signature: 'HackTool:Win32',
      systemId: 'sys-1',
      accountId: 'acc-1',
      hash: 'deadbeef',
      verdict: 'compromised',
      tags: 'exfil,tooling',
    })
    const names = content.rows.map((row) => row.name)
    expect(names).not.toContain('filename')
    expect(names).not.toContain('systemId')
    expect(names).not.toContain('accountId')
    expect(names).not.toContain('tags')
    expect(names).not.toContain('verdict')
    // Spec order, which puts the hash beside the filename above the fold: it
    // is what identifies the file.
    expect(names).toEqual(['hash', 'family', 'signature'])
  })

  it('keeps a checkbox only when it is true', () => {
    const on = cardContentOf(specsFixture, form('system'), {
      hostname: 'WKS-FIN01',
      isolated: true,
    })
    const off = cardContentOf(specsFixture, form('system'), {
      hostname: 'WKS-FIN01',
      isolated: false,
    })
    expect(on.rows.map((row) => row.name)).toContain('isolated')
    expect(off.rows.map((row) => row.name)).not.toContain('isolated')
  })

  it('stops at the cap rather than putting a panel under the pointer', () => {
    const content = cardContentOf(specsFixture, form('network'), {
      type: 'ipv4', value: '185.220.101.43',
      port: '443',
      context: 'c2 beacon',
      blocked: true,
      blockedAt: '2026-07-24T15:00:00+00:00',
      disposition: 'malicious',
    })
    expect(content.rows).toHaveLength(CARD_FIELD_LIMIT)
  })

  it('uses the short label, not the form s parenthetical help', () => {
    const content = cardContentOf(specsFixture, form('system'), {
      hostname: 'WKS-FIN01',
      analyst: 'p.zero',
    })
    expect(content.rows.find((row) => row.name === 'analyst')?.label).toBe('Analyst')
  })
})

describe('how many entries point at an entity', () => {
  const entries = [
    { id: 'e1', systemId: 'sys-1', accountIds: ['acc-1'] },
    { id: 'e2', sourceSystemId: 'sys-1', accountIds: [] },
    { id: 'e3', systemId: 'sys-2', malwareIds: ['mal-1', 'sys-1'] },
    { id: 'e4', systemId: null, description: 'nothing here' },
  ]

  it('counts a scalar reference, a list membership and both in one entry', () => {
    expect(referenceCount(entries, 'sys-1')).toBe(3)
    expect(referenceCount(entries, 'acc-1')).toBe(1)
    expect(referenceCount(entries, 'sys-2')).toBe(1)
  })

  it('counts nothing for an id nothing links, and never counts the entry s own id', () => {
    expect(referenceCount(entries, 'never-seen')).toBe(0)
    expect(referenceCount(entries, 'e1')).toBe(0)
    expect(referenceCount(entries, '')).toBe(0)
  })
})
