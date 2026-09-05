/**
 * The parser that replaced the string filter, held against what it dropped.
 */
import { describe, expect, it } from 'vitest'

import { parseEntity } from './entities.js'
import { PROTOTYPE_KEYS } from '../../../../test/prototype-keys.js'

const entity = (kind: string, properties: Record<string, unknown>) => ({
  kind,
  id: 'e-1',
  name: 'e-1',
  properties,
})

describe('parsing a Sentinel entity', () => {
  it('keeps a numeric property, which the string filter discarded', () => {
    const parsed = parseEntity(entity('CloudApplication', { saasId: 11161, instanceId: 3 }))
    expect(parsed?.properties['saasId']).toBe('11161')
  })

  it('keeps a boolean property', () => {
    const parsed = parseEntity(entity('Host', { hostName: 'WKS-01', isDomainJoined: true }))
    expect(parsed?.properties['isDomainJoined']).toBe(true)
  })

  it('keeps a nested object property', () => {
    const parsed = parseEntity(
      entity('Ip', { address: '203.0.113.9', location: { countryName: 'Netherlands', city: 'Utrecht' } }),
    )
    expect(parsed?.properties['location']).toMatchObject({ countryName: 'Netherlands' })
  })

  it('keeps a list property', () => {
    const parsed = parseEntity(
      entity('File', {
        name: 'invoice.exe',
        fileHashes: [{ properties: { hashValue: 'abc123', algorithm: 'SHA256' } }],
      }),
    )
    expect(parsed?.properties['fileHashes']).toHaveLength(1)
  })

  /**
   * **The kinds with a home that were never read.**
   */
  it.each([
    ['Malware', { name: 'Win32/Toga!rfn', category: 'Trojan' }],
    ['File', { name: 'invoice.exe', directory: 'C:\\Users' }],
    ['Url', { url: 'https://example.invalid/path' }],
    ['DnsResolution', { domainName: 'c2.example.invalid' }],
  ])('reads a %s entity', (kind, properties) => {
    expect(parseEntity(entity(kind, properties))).not.toBeNull()
  })

  it('answers null for a kind with no home in a case, rather than throwing', () => {
    expect(parseEntity(entity('Mailbox', { mailboxPrimaryAddress: 'a@b.invalid' }))).toBeNull()
  })

  it('answers null for a malformed entity, so one bad row cannot refuse an import', () => {
    expect(parseEntity({ nothing: 'like an entity' })).toBeNull()
    expect(parseEntity(null)).toBeNull()
  })

  /** ARM spells kinds differently across APIs; the aliases are not derivable. */
  it.each([['ip'], ['Ip'], ['IP']])('reads %s as the IP kind', (spelling) => {
    expect(parseEntity(entity(spelling, { address: '203.0.113.9' }))?.kind).toBe('Ip')
  })
})

describe('an entity kind that is a key on Object.prototype', () => {
  /**
   * **`null` or a skipped row, never a throw.**
   */
  it.each(PROTOTYPE_KEYS)(
    'is skipped rather than thrown on: %o', (kind) => {
      let parsed: unknown
      expect(() => {
        parsed = parseEntity({ kind, id: 'e-1', properties: { hostName: 'web01' } })
      }).not.toThrow()
      expect(parsed).toBeNull()
    },
  )
})

