/**
 * The mapping tables, against the schemas they target.
 */
import { describe, expect, it } from 'vitest'

import { COLLECTION_SCHEMAS } from '../../../domain/collections.js'
import { parseEntity } from './entities.js'
import { MAPPINGS, mapEntity, startsChecked, unknownFields } from './mapping.js'
import { PROTOTYPE_KEYS } from '../../../../test/prototype-keys.js'

const entity = (kind: string, properties: Record<string, unknown>) => {
  const parsed = parseEntity({ kind, id: 'e-1', name: 'e-1', properties })
  if (!parsed) throw new Error(`${kind} did not parse`)
  return parsed
}

describe('the Sentinel mapping tables', () => {
  it('names only fields the target collection has', () => {
    expect(unknownFields()).toEqual([])
  })

  /**
   * **Not the same assertion twice.**
   */
  it.each([
    ['Host', { hostName: 'WKS-0142', osFamily: 'Windows', dnsDomain: 'corp.example' }],
    ['Account', { accountName: 'k.varga', upnSuffix: 'example.invalid' }],
    ['Ip', { address: '203.0.113.9' }],
    ['FileHash', { hashValue: 'abc123', algorithm: 'SHA256' }],
    ['Malware', { name: 'Win32/Toga!rfn', category: 'Trojan' }],
    ['File', { name: 'invoice.exe', directory: 'C:\\Users' }],
    ['Url', { url: 'https://c2.example.invalid/beacon' }],
    ['DnsResolution', { domainName: 'c2.example.invalid' }],
    ['CloudApplication', { appName: 'Ledger Sync', instanceName: 'EU' }],
  ])('maps a %s onto a row its collection accepts', (kind, properties) => {
    const mapped = mapEntity(entity(kind, properties))
    expect(mapped, 'the entity carried no usable identity').not.toBeNull()

    const schema = COLLECTION_SCHEMAS[mapped!.collection]
    const parsed = schema!.safeParse(mapped!.fields)
    expect(parsed.success ? [] : parsed.error.issues).toEqual([])
  })

  /**
   * **The entities that name a file, which the old mapping never read.**
   */
  it('takes a filename from Malware and File rather than inventing one', () => {
    expect(mapEntity(entity('Malware', { name: 'Win32/Toga!rfn', category: 'Trojan' }))?.fields)
      .toMatchObject({ filename: 'Win32/Toga!rfn', family: 'Trojan' })
    expect(mapEntity(entity('File', { name: 'invoice.exe' }))?.fields)
      .toMatchObject({ filename: 'invoice.exe' })
  })

  it('carries a geolocation into the indicator context, which a string filter could not', () => {
    const mapped = mapEntity(
      entity('Ip', {
        address: '203.0.113.9',
        location: { countryName: 'Netherlands', city: 'Utrecht' },
      }),
    )
    expect(mapped?.fields['context']).toContain('Utrecht')
  })

  it('reads a numeric saasId, which is the field the deprecated appId replaced', () => {
    const mapped = mapEntity(entity('CloudApplication', { saasId: 11161 }))
    expect(mapped?.fields['appName']).toBe('11161')
  })

  describe('identity', () => {
    /**
     * **A qualifier separates two entities only if it reaches a column.**
     */
    it('merges two hosts of one name, because systems has no domain column', () => {
      const a = mapEntity(entity('Host', { hostName: 'web01', dnsDomain: 'corp.example' }))
      const b = mapEntity(entity('Host', { hostName: 'web01', dnsDomain: 'lab.example' }))
      expect(a?.identity).toBe(b?.identity)
    })

    it('separates an address from a domain that reads the same', () => {
      const address = mapEntity(entity('Ip', { address: '1.2.3.4' }))
      const domain = mapEntity(entity('DnsResolution', { domainName: '1.2.3.4' }))
      expect(address?.identity).not.toBe(domain?.identity)
    })

    /** A URL keeps its path, which the domain column had nowhere to put. */
    it('keeps a URL whole rather than reducing it to a host', () => {
      const mapped = mapEntity(entity('Url', { url: 'http://paste.example/raw/xyz' }))
      expect(mapped?.fields['type']).toBe('url')
      expect(String(mapped?.fields['value'])).toContain('/raw/xyz')
    })

    /**
     * **A private address is only an address within a network.**
     */
    it('separates one address in two scopes', () => {
      const a = mapEntity(entity('Ip', { address: '10.0.0.5', addressScope: 'branch-a' }))
      const b = mapEntity(entity('Ip', { address: '10.0.0.5', addressScope: 'branch-b' }))
      expect(a?.fields['scope']).toBe('branch-a')
      expect(a?.identity).not.toBe(b?.identity)
    })

    /** An address with no scope still matches itself -- the scope strengthens. */
    it('keeps an unscoped address matching an unscoped address', () => {
      const a = mapEntity(entity('Ip', { address: '203.0.113.9' }))
      const b = mapEntity(entity('Ip', { address: '203.0.113.9' }))
      expect(a?.identity).toBe(b?.identity)
    })

    it('maps the instance to its own field, leaving the publisher alone', () => {
      const mapped = mapEntity(entity('CloudApplication', {
        appName: 'Ledger', instanceName: 'acme-tenant-eu',
      }))
      expect(mapped?.fields['instance']).toBe('acme-tenant-eu')
      expect(mapped?.fields['publisher'] ?? '').toBe('')
    })

    it('separates two instances of one cloud application', () => {
      const a = mapEntity(entity('CloudApplication', { appName: 'Ledger', instanceName: 'EU' }))
      const b = mapEntity(entity('CloudApplication', { appName: 'Ledger', instanceName: 'US' }))
      expect(a?.identity).not.toBe(b?.identity)
    })

    it('cannot be forged by moving a character across the join', () => {
      const a = mapEntity(entity('Host', { hostName: 'web01', dnsDomain: 'corp' }))
      const b = mapEntity(entity('Host', { hostName: 'web01c', dnsDomain: 'orp' }))
      expect(a?.identity).not.toBe(b?.identity)
    })

    it('is the same for the same host seen twice, whatever the case', () => {
      const a = mapEntity(entity('Host', { hostName: '  WKS-0142 ', dnsDomain: 'CORP.example' }))
      const b = mapEntity(entity('Host', { hostName: 'wks-0142', dnsDomain: 'corp.example' }))
      expect(a?.identity).toBe(b?.identity)
    })
  })

  it('skips an entity with no identity rather than importing it blank', () => {
    expect(mapEntity(entity('Host', { osFamily: 'Windows' }))).toBeNull()
  })

  it('drops a blank field rather than sending it', () => {
    const mapped = mapEntity(entity('Host', { hostName: 'WKS-0142' }))
    expect(Object.keys(mapped!.fields)).not.toContain('systemType')
  })

  /**
   * **A judgement about the provider's data, carried over from the client.**
   */
  describe('what starts ticked', () => {
    const indicator = (address: string) =>
      startsChecked(mapEntity(entity('Ip', { address }))!)

    it.each([['10.0.0.5'], ['192.168.1.9'], ['172.16.4.4'], ['127.0.0.1'], ['169.254.1.1'], ['fe80::1'], ['fc00::9']])(
      'leaves the private address %s unticked',
      (address) => {
        expect(indicator(address)).toBe(false)
      },
    )

    it.each([['203.0.113.9'], ['8.8.8.8'], ['2606:4700::1111']])(
      'ticks the routable address %s',
      (address) => {
        expect(indicator(address)).toBe(true)
      },
    )

    it('ticks an address it cannot parse, rather than hiding it', () => {
      expect(indicator('not-an-address')).toBe(true)
    })

    it('ticks everything that is not an address', () => {
      expect(startsChecked(mapEntity(entity('Host', { hostName: 'WKS-0142' }))!)).toBe(true)
    })
  })

  it('maps every kind the parser reads', () => {
    expect(Object.keys(MAPPINGS).sort()).toEqual(
      ['Account', 'CloudApplication', 'DnsResolution', 'File', 'FileHash', 'Host', 'Ip', 'Malware', 'Url'].sort(),
    )
  })
})

/**
 * Entities the mapper must not silently drop, from the review's probe table.
 */
describe('what reaches the review panel at all', () => {
  it('maps an account that carries no domain', () => {
    const mapped = mapEntity(entity('Account', { accountName: 'svc_backup' }))
    expect(mapped, 'a local account is not unmappable').not.toBeNull()
    expect(mapped?.fields['accountName']).toBe('svc_backup')
  })

  /** And it is not thereby the same account as a domained one of that name. */
  it('keeps a domainless account apart from a domained one', () => {
    const bare = mapEntity(entity('Account', { accountName: 'admin' }))
    const owned = mapEntity(entity('Account', { accountName: 'admin', upnSuffix: 'corp.local' }))
    expect(bare?.identity).not.toBe(owned?.identity)
  })

  /**
   * **A label of `''` renders as a blank row.**
   */
  it('labels a file hash that carries only a friendly name', () => {
    const mapped = mapEntity(entity('FileHash', { friendlyName: 'dropper.bin' }))
    expect(mapped?.label).not.toBe('')
  })

  it('labels a cloud application known only by its id', () => {
    const mapped = mapEntity(entity('CloudApplication', { appId: '11161' }))
    expect(mapped?.label).not.toBe('')
  })
})

describe('an osFamily that is a key on Object.prototype', () => {
  /**
   * **Every mapped value is a string, whatever the vendor sent.**
   */
  it.each([...PROTOTYPE_KEYS, 'android'])(
    'maps osFamily %o to a string', (osFamily) => {
      const row = mapEntity({
        kind: 'Host',
        ref: 'e-1',
        properties: { hostName: 'web01', osFamily },
      })
      for (const [field, value] of Object.entries(row?.fields ?? {}))
        expect(typeof value, field).toBe('string')
    },
  )
})

