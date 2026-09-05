/**
 * Which Sentinel entity becomes which row, and which property fills which field.
 */
import { isIP } from 'node:net'

import { identitiesOf } from '../../../collections/identity.js'
import { qualified } from '../../../domain/naming.lists.js'
import { COLLECTION_SCHEMAS } from '../../../domain/collections.js'
import type { ParsedEntity, SentinelKind } from './entities.js'

/** What a row looks like before its collection's schema has seen it. */
export type Draft = Record<string, unknown>

interface Mapping {
  /** The collection this kind lands in, spelled as the registry spells it. */
  collection: string
  /** The row, from the parsed properties. Blank values are dropped after. */
  fields: (properties: Record<string, unknown>) => Draft
  /** What the review panel calls this row. */
  label: (properties: Record<string, unknown>) => string
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
const lower = (value: unknown): string => text(value).toLowerCase()

/**
 * Sentinel's `OSFamily` against this product's `systemType` vocabulary.
 */
const SYSTEM_TYPE_FROM_OS: ReadonlyMap<string, string> = new Map([
  ['android', 'mobile'],
  ['ios', 'mobile'],
])


export const MAPPINGS: Record<SentinelKind, Mapping> = {
  Host: {
    collection: 'systems',
    fields: (p) => ({
      hostname: text(p['hostName']) || text(p['netBiosName']),
      systemType: SYSTEM_TYPE_FROM_OS.get(lower(p['osFamily'])) ?? '',
    }),
    label: (p) => text(p['hostName']) || text(p['netBiosName']) || text(p['friendlyName']),
  },

  Account: {
    collection: 'accounts',
    fields: (p) => ({
      accountName: text(p['accountName']) || text(p['name']) || text(p['aadUserId']),
      domain: text(p['upnSuffix']) || text(p['dnsDomain']) || text(p['ntDomain']),
    }),
    label: (p) => {
      const name = text(p['accountName']) || text(p['name'])
      const domain = text(p['upnSuffix']) || text(p['dnsDomain'])
      return domain ? `${name}@${domain}` : name
    },
  },

  Ip: {
    collection: 'network_indicators',
    fields: (p) => {
      const location = p['location'] as { countryName?: string; city?: string } | undefined
      const place = [location?.city, location?.countryName].filter(Boolean).join(', ')
      const address = text(p['address'])
      return {
        // **`isIP`, not a substring test.** Sentinel `Ip` entities carry a
        // port, and `1.2.3.4:445` contains a colon -- typed `ipv6` it then
        // read as globally routable and started ticked.
        value: address,
        type: isIP(address) === 6 ? 'ipv6' : 'ipv4',
        // **The scope is what makes a private address an identity.** Every
        // RFC1918 range repeats across sites.
        scope: text(p['addressScope']),
        // `Location` is a geo object, which the string filter could never carry.
        context: place ? `Geolocated to ${place} by the provider.` : '',
      }
    },
    label: (p) => text(p['address']),
    // `AddressScope` is what makes a private address identifiable at all.
  },

  FileHash: {
    collection: 'malware',
    fields: (p) => ({
      // A `FileHash` names no file; the algorithm is what is known about it.
      filename: text(p['friendlyName']) || text(p['hashValue']),
      hash: text(p['hashValue']),
      signature: text(p['algorithm']),
    }),
    label: (p) => text(p['hashValue']),
  },

  Malware: {
    collection: 'malware',
    fields: (p) => ({ filename: text(p['name']), family: text(p['category']) }),
    label: (p) => text(p['name']),
  },

  File: {
    collection: 'malware',
    fields: (p) => {
      const hashes = (p['fileHashes'] ?? []) as { properties?: { hashValue?: string } }[]
      return {
        filename: text(p['name']),
        hash: text(hashes[0]?.properties?.hashValue),
      }
    },
    label: (p) => text(p['name']),
  },

  CloudApplication: {
    collection: 'cloud_apps',
    fields: (p) => ({
      appName: text(p['appName']) || text(p['name']) || text(p['saasId']) || text(p['appId']),
      // **Sentinel sends no publisher**, so that field stays the analyst's.
      instance: text(p['instanceName']),
    }),
    label: (p) => {
      const name = text(p['appName']) || text(p['name']) || text(p['saasId'])
      const instance = text(p['instanceName'])
      return qualified(name, instance)
    },
  },

  Url: {
    collection: 'network_indicators',
    // **Whole, not reduced to its host.** The URL went in as a domain and its
    // path went into `context` as prose, so two paths on one host were one
    // indicator and neither could be blocked as written.
    fields: (p) => ({ value: text(p['url']), type: 'url' }),
    label: (p) => text(p['url']),
  },

  DnsResolution: {
    collection: 'network_indicators',
    fields: (p) => ({ value: text(p['domainName']), type: 'domain' }),
    label: (p) => text(p['domainName']),
  },
}

/**
 * The unit separator, built rather than typed.
 */
export const SEPARATOR = String.fromCharCode(31)

/**
 * Whether a mapped entity starts ticked in the review panel.
 */
export function startsChecked(entity: MappedEntity): boolean {
  if (entity.collection !== 'network_indicators') return true
  // **Only an address can be private.** A domain or a URL is never one, and
  // reading the kind is what says so -- the shape of the value used to.
  const kind = entity.fields['type']
  if (kind !== 'ipv4' && kind !== 'ipv6') return true
  const address = typeof entity.fields['value'] === 'string' ? entity.fields['value'] : ''
  return !address || isGloballyRoutable(address, kind)
}

/**
 * **The kind is passed in rather than sniffed again.**
 */
function isGloballyRoutable(address: string, kind: 'ipv4' | 'ipv6'): boolean {
  const value = address.trim().toLowerCase()
  if (kind === 'ipv6') {
    if (value === '::1' || value === '::') return false
    if (/^f[cd]/.test(value)) return false // fc00::/7, unique local
    if (/^fe[89ab]/.test(value)) return false // fe80::/10, link local
    return true
  }
  const octets = value.split('.')
  if (octets.length !== 4) return true // not an address this can judge
  const parsed = octets.map((part) => Number(part))
  if (parsed.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a = 0, b = 0] = parsed
  if (a === 10 || a === 127 || a === 0) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 169 && b === 254) return false
  if (a >= 224) return false // multicast and reserved
  return true
}

export interface MappedEntity {
  collection: string
  fields: Draft
  label: string
  /** The strongest identity this entity carries. */
  identity: string
  /**
   * The same identity with its weaker halves, strongest first.
   */
  identities: string[]
}

/** The first non-empty value a mapped row holds, or `''`. */
function firstValue(fields: Record<string, unknown>): string {
  for (const value of Object.values(fields)) {
    if (typeof value === 'string' && value !== '') return value
  }
  return ''
}

/**
 * One parsed entity as a row, or `null` when it carries no usable identity.
 */
export function mapEntity(entity: ParsedEntity): MappedEntity | null {
  const mapping = MAPPINGS[entity.kind]

  const fields = Object.fromEntries(
    Object.entries(mapping.fields(entity.properties)).filter(([, value]) => value !== ''),
  )

  /**
   * **Derived from the row this became, not from the payload it came from.**
   */
  const identities = identitiesOf(mapping.collection, fields)
  const strongest = identities[0]
  if (!strongest) return null

  return {
    collection: mapping.collection,
    fields,
    /**
     * **The row's own leading value, not a slice of the identity.**
     */
    label: mapping.label(entity.properties) || firstValue(fields),
    identity: strongest,
    identities,
  }
}

/**
 * Every mapping names a real collection, and every field it produces is one
 * that collection has.
 */
export function unknownFields(): string[] {
  const wrong: string[] = []
  for (const [kind, mapping] of Object.entries(MAPPINGS)) {
    const schema = COLLECTION_SCHEMAS[mapping.collection]
    if (!schema) {
      wrong.push(`${kind}: no collection ${mapping.collection}`)
      continue
    }
    const allowed = new Set(Object.keys(schema.shape))
    for (const name of Object.keys(mapping.fields({}))) {
      if (!allowed.has(name)) wrong.push(`${kind}: ${mapping.collection} has no ${name}`)
    }
  }
  return wrong
}
