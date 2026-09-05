/**
 * The indicator feed, attacked at the two claims it makes.
 */
import { describe, expect, it } from 'vitest'

import { INDICATOR_TYPE } from '../domain/vocabularies.lists.js'

import { PROTOTYPE_KEYS } from '../../test/prototype-keys.js'

import { hashTypeOf } from '../domain/hashes.lists.js'
import { toCsv } from './csv.js'
import {
  actionable,
  collect,
  toStixBundle,
  tlpMarking,
  toCsvRows,
  INDICATOR_CSV_COLUMNS,
} from './indicators.js'

const NOW = new Date('2026-03-04T05:06:07.000Z')
/** Deterministic ids, so a bundle can be asserted rather than eyeballed. */
const ids = () => '11111111-2222-3333-4444-555555555555'

const empty = { networkIndicators: [], malware: [], cloudApps: [] }

/** Provenance neither `actionable` nor the bundle reads. The CSV is where it matters. */
const unsourced = { source: '', caseId: '' }

describe('the STIX pattern vocabulary', () => {
  /**
   * **Every kind the schema can store has a pattern.**
   */
  it.each([...INDICATOR_TYPE])('writes a pattern for %s', (kind) => {
    const found = collect({
      ...empty,
      networkIndicators: [{ type: kind, value: 'x', disposition: 'malicious' }],
    })
    const bundle = toStixBundle(found, { now: NOW, ids }) as {
      objects: { type: string }[]
    }
    expect(bundle.objects.some((one) => one.type === 'indicator'), kind).toBe(true)
  })
})

describe('a stored indicator reaches the export', () => {
  /**
   * **The row carries its kind now, and `collect` used to guess it.**
   */
  it('emits one entry per row, with the kind the row stores', () => {
    const found = collect({
      networkIndicators: [
        { type: 'ipv4', value: '198.51.100.7', disposition: 'malicious', context: '', blocked: false },
        { type: 'url', value: 'http://evil.example/a', disposition: 'suspicious', context: '', blocked: false },
      ],
      malware: [],
      cloudApps: [],
    })
    expect(found.map((one) => `${one.type}:${one.value}`)).toEqual([
      'ipv4:198.51.100.7',
      'url:http://evil.example/a',
    ])
  })
})

describe('recognising a digest', () => {
  it.each([
    ['d41d8cd98f00b204e9800998ecf8427e', 'md5'],
    ['da39a3ee5e6b4b0d3255bfef95601890afd80709', 'sha1'],
    ['e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'sha256'],
  ])('reads %s as %s', (digest, expected) => {
    expect(hashTypeOf(digest)).toBe(expected)
  })

  /** A filename is not a digest, and neither is a truncated one. */
  it.each([['evil.exe'], ['abc'], [''], [null], ['zzzz8cd98f00b204e9800998ecf8427e']])(
    'refuses %j',
    (given) => {
      expect(hashTypeOf(given)).toBeNull()
    },
  )
})

describe('collecting', () => {
  /**
   * **Both retired with the two columns they were about.**
   */
  it('takes the kind from the row rather than the shape of the value', () => {
    const found = collect({
      ...empty,
      networkIndicators: [
        { type: 'domain', value: 'evil.test/a' },
        { type: 'url', value: 'evil.test/b' },
      ],
    })
    expect(found.map((one) => one.type)).toEqual(['domain', 'url'])
  })

  /** A filename alone is pushable to nothing, so the row is skipped entirely. */
  it('skips a malware row with no usable digest rather than exporting it blank', () => {
    const found = collect({ ...empty, malware: [{ filename: 'evil.exe', hash: '' }] })
    expect(found).toEqual([])
  })

  it('lowercases a digest, so the same file is one indicator however it was typed', () => {
    const found = collect({
      ...empty,
      malware: [{ hash: 'D41D8CD98F00B204E9800998ECF8427E', filename: 'a.exe' }],
    })
    expect(found[0]!.value).toBe('d41d8cd98f00b204e9800998ecf8427e')
  })

  it('ignores an empty or whitespace-only value', () => {
    expect(collect({ ...empty, networkIndicators: [{ type: 'ipv4', value: '   ' }] })).toEqual([])
  })
})

describe('what is actionable', () => {
  it.each([['benign'], ['clean'], ['BENIGN']])('excludes %s', (disposition) => {
    expect(
      actionable({ type: 'ipv4', value: 'x', disposition, context: '', blocked: false, ...unsourced }),
    ).toBe(
      false,
    )
  })

  /**
   * **An exclusion list, so an unrecognised verdict is exported.**
   */
  it.each([['malicious'], ['suspicious'], [''], ['under review'], ['not-yet-a-word']])(
    'includes %j',
    (disposition) => {
      expect(
        actionable({ type: 'ipv4', value: 'x', disposition, context: '', blocked: false, ...unsourced }),
      ).toBe(true)
    },
  )
})

describe('the STIX bundle', () => {
  const indicators = collect({
    networkIndicators: [
      { type: 'ipv4', value: '10.0.0.1', disposition: 'malicious', context: 'c2' },
      { type: 'ipv4', value: '10.0.0.9', disposition: 'benign', context: 'cleared' },
    ],
    malware: [{ hash: 'd41d8cd98f00b204e9800998ecf8427e', verdict: 'malicious', filename: 'a.exe' }],
    cloudApps: [{ appName: 'Shady App', consentType: 'admin' }],
  })

  it('carries only the actionable indicators', () => {
    const bundle = toStixBundle(indicators, { now: NOW, ids })
    const patterns = (bundle['objects'] as { pattern: string }[]).map((one) => one.pattern)

    expect(patterns).toContain("[ipv4-addr:value = '10.0.0.1']")
    expect(patterns.join(' ')).not.toContain('10.0.0.9')
  })

  it("writes a file hash pattern with STIX's own hash name", () => {
    const bundle = toStixBundle(indicators, { now: NOW, ids })
    const patterns = (bundle['objects'] as { pattern: string }[]).map((one) => one.pattern)
    expect(patterns).toContain("[file:hashes.'MD5' = 'd41d8cd98f00b204e9800998ecf8427e']")
  })

  it('leaves a cloud app out of the bundle rather than inventing a pattern', () => {
    const bundle = toStixBundle(indicators, { now: NOW, ids })
    expect(JSON.stringify(bundle)).not.toContain('Shady App')
  })

  it('is a 2.1 bundle whose objects declare their spec version', () => {
    const bundle = toStixBundle(indicators, { now: NOW, ids })
    expect(bundle['type']).toBe('bundle')
    for (const object of bundle['objects'] as Record<string, unknown>[]) {
      expect(object['spec_version']).toBe('2.1')
      expect(object['pattern_type']).toBe('stix')
      expect(String(object['id'])).toMatch(/^indicator--/)
    }
  })

  it('carries no marking when none was asked for', () => {
    const bundle = toStixBundle(indicators, { now: NOW, ids })
    const first = (bundle['objects'] as Record<string, unknown>[])[0]!
    expect(first).not.toHaveProperty('object_marking_refs')
  })

  it('uses the specification id for a TLP marking', () => {
    const bundle = toStixBundle(indicators, { now: NOW, ids, tlp: 'amber' })
    const first = (bundle['objects'] as Record<string, unknown>[])[0]!
    expect(first['object_marking_refs']).toEqual([
      'marking-definition--f88d31f6-486f-44da-b317-01333bde0b82',
    ])
  })

  it('refuses a TLP nobody defined', () => {
    expect(() => tlpMarking('taupe')).toThrow(/No TLP marking/)
    // **A key on `Object.prototype` is not a TLP.** A bare object answers
    // `constructor` with a function, which is truthy -- so this threw for
    // `taupe` and returned a function as a marking id for `constructor`. The
    // controller rejects it first; the contract here has to hold on its own.
    for (const named of PROTOTYPE_KEYS)
      expect(() => tlpMarking(named), named).toThrow(/No TLP marking/)
  })

  /** A quote in a value would otherwise close the pattern string. */
  it('escapes a quote so the pattern cannot be broken out of', () => {
    const bundle = toStixBundle(
      [
        {
          type: 'domain',
          value: "evil'.test",
          disposition: 'malicious',
          context: '',
          blocked: false,
          ...unsourced,
        },
      ],
      { now: NOW, ids },
    )
    const first = (bundle['objects'] as { pattern: string }[])[0]!
    expect(first.pattern).toBe("[domain-name:value = 'evil\\'.test']")
  })
})

describe('the CSV says where an indicator came from', () => {
  /**
   * **A different value per table, because one value everywhere cannot fail.**
   */
  it('reads the door and the case off each of the three tables', () => {
    const found = collect({
      networkIndicators: [
        { caseId: 'case-net', source: 'sentinel', type: 'ipv4', value: '198.51.100.7' },
      ],
      malware: [
        { caseId: 'case-mal', source: 'defender', hash: 'd41d8cd98f00b204e9800998ecf8427e' },
      ],
      cloudApps: [{ caseId: 'case-app', source: 'manual', appName: 'Widget' }],
    })

    expect(found.map((one) => [one.source, one.caseId])).toEqual([
      ['sentinel', 'case-net'],
      ['defender', 'case-mal'],
      ['manual', 'case-app'],
    ])
  })

  /**
   * **The header spelling is the contract, and it is snake_case.**
   */
  it('writes both columns under the names the header declares', async () => {
    const found = collect({
      ...empty,
      networkIndicators: [
        {
          caseId: 'c-1',
          source: 'sentinel',
          type: 'ipv4',
          value: '198.51.100.7',
          disposition: 'malicious',
          context: 'beacon',
          blocked: true,
        },
      ],
    })

    const csv = await toCsv(toCsvRows(found), [...INDICATOR_CSV_COLUMNS])

    expect(csv.split('\n')[0]).toBe('type,value,disposition,context,source,blocked,case_id')
    expect(csv.split('\n')[1]).toBe('ipv4,198.51.100.7,malicious,beacon,sentinel,1,c-1')
  })
})
