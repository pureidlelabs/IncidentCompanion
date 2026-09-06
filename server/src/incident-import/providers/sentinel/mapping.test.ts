/**
 * The mapping tables, against the schemas they target.
 *
 * **The first case is the one that makes the tables safe.** Every field a
 * mapping produces has to be a field its collection has; the arrangement this
 * replaces had no relationship to the target at all, and each mismatch was
 * found by an analyst getting a 422 -- `source` on every entity, `filename`
 * empty on a hash, `provenance` on every timeline row.
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
   * **Not the same assertion twice.** The check above reads the field names a
   * mapping declares; this one puts a real mapped row through the collection's
   * own schema, which is what the write will do. A default, a vocabulary or a
   * minimum length is only visible from here.
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
   * **The entities that name a file, which the old mapping never read.** A
   * `FileHash` carries `Algorithm` and `Value` and nothing else, so feeding the
   * malware table from it meant inventing a filename out of the hash.
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
     *
     * These two asserted the opposite, and could only ever hold on the way in.
     * `systems` has no domain column and `network_indicators` has no scope, so
     * a stored row cannot present either -- which meant the domain-qualified
     * identity matched nothing on a re-import and the bare one matched
     * instead. Two hosts kept apart within a payload merged across payloads,
     * which is worse than either answer consistently.
     *
     * Identities come from the mapped row now, so the qualifier is kept
     * exactly where the table can keep it. The cloud case below separates
     * because `cloud_apps` grew an `instance` column; these two have no
     * column to keep their qualifier in.
     */
    it('merges two hosts of one name, because systems has no domain column', () => {
      const a = mapEntity(entity('Host', { hostName: 'web01', dnsDomain: 'corp.example' }))
      const b = mapEntity(entity('Host', { hostName: 'web01', dnsDomain: 'lab.example' }))
      expect(a?.identity).toBe(b?.identity)
    })

    /**
     * **An address and a domain that read the same are not one indicator.**
     * Identity had nothing but the value to key on, so `1.2.3.4` arriving as
     * an `Ip` and `1.2.3.4` arriving as a `DnsResolution` were one row -- and
     * the kind was re-derived at export time from the value's shape, which is
     * the same guess made twice.
     */
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
     * **A private address is only an address within a network.** Every RFC1918
     * range repeats across sites, which in this product is the common case
     * rather than the edge -- so `10.0.0.5` at two branches was one indicator,
     * and blocking it read as blocking both. Microsoft documents
     * `Address+AddressScope` as the strong form for exactly this.
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

    /**
     * **The instance is not the publisher.** It was written to `publisher`
     * because no column held it, so an analyst read a field labelled Publisher
     * carrying a tenant name -- and the publisher it displaced had nowhere to
     * go. Sentinel sends no publisher at all, so that field stays the
     * analyst's to fill.
     */
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

    /**
     * **The join cannot be ambiguous.** With no separator, `web01` + `corp` and
     * `web01c` + `orp` are one key; the parts are joined with the unit
     * separator, which no hostname, URL or address can contain.
     */
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
   * An analyst unticking the same RFC1918 addresses every import is what a
   * default is for; anything unparseable fails open, because a row the app
   * cannot judge is the analyst's call rather than one to hide.
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
 *
 * Every `Account` fixture in both tiers carried a domain, so the one shape
 * that did not was invisible to every suite.
 */
describe('what reaches the review panel at all', () => {
  /**
   * **A local or service account has no domain and is still an account.**
   * `SYSTEM`, `svc_backup` and every service principal arrive with no
   * `upnSuffix`, `dnsDomain` or `ntDomain`. They were counted into
   * `skipped.unmappable` -- which no screen renders -- so the analyst saw an
   * incident with fewer entities than Sentinel shows and no reason why, and
   * the alert's link to that account went with it.
   */
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
   * **Every mapped value is a string, whatever the vendor sent.** A bare
   * object answers `constructor` with a function, and the `?? ''` beside the
   * lookup does not fire on one -- so `systemType` left here as a function,
   * passed `mapEntity`'s blank filter, and JSON-serialised away over the wire.
   * The analyst saw a normal candidate and the commit 422'd on a field the
   * review screen never showed.
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

