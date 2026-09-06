/**
 * Which Sentinel entity becomes which row, and which property fills which field.
 *
 * **A declaration against the target's own schema, not a function.** Every
 * mapping names a `collection` from the registry and produces fields that
 * `COLLECTION_SCHEMAS[collection]` then validates -- so a field a collection
 * does not have fails here, in the tier that owns both sides, instead of as a
 * 422 in front of an analyst. The arrangement it replaces was a five-branch
 * `if` in the client returning `Record<string, string>` with no relationship to
 * anything.
 *
 * **`Malware` and `File` are read, and that is why the malware table stops
 * being fed by a hash.** A `FileHash` entity carries `Algorithm` and `Value`
 * and no name at all, so a filename had to be fabricated from the hash; the
 * entities that name a file are `File` and `Malware`, and both are mapped.
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
 *
 * **Only where the two genuinely agree.** `Windows` and `Linux` say nothing
 * about whether a host is a server or a laptop, which is what `systemType`
 * records -- so they map to nothing and the field stays unset for the analyst
 * to answer. `Android` and `IOS` do carry the shape of the device.
 *
 * **A `Map`, because the key is a vendor string.** A bare object answers
 * `constructor` with a function and `__proto__` with the prototype; `?? ''`
 * fires on neither, and the non-string reached `fields` and serialised away
 * over the wire -- so the review screen showed a normal candidate and the
 * commit 422'd on a field it had never drawn.
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
 *
 * **No identity part can contain it**, so one kind's key cannot forge another's
 * -- a hostname or a URL may hold a space, a colon or a pipe, and joining with
 * nothing at all would make `web01` + `corp` and `web01c` + `orp` one row.
 * `String.fromCharCode` because the character has no place in source: the
 * repository's lint refuses a non-ASCII literal, and a control character in a
 * file is invisible to everyone who reads it.
 *
 * Exported so the stored side joins on the same character rather than
 * re-deriving it; it was written out three times and the copies had already
 * disagreed once by a trailing separator, which made every weak form miss.
 */
export const SEPARATOR = String.fromCharCode(31)

/**
 * Whether a mapped entity starts ticked in the review panel.
 *
 * **A private address is usually noise**, and unticking the same rows every
 * import is what a default is for. The blocks named are the ones that appear in
 * incident payloads rather than every reserved range, and anything this cannot
 * parse fails open -- ticked, and the analyst decides.
 *
 * Carried over from the client, where it was `defaultEntityChecked`. It is a
 * judgement about the provider's data, so it belongs beside the mapping that
 * reads it rather than in the tier that renders the checkbox.
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
 * **The kind is passed in rather than sniffed again.** The caller has already
 * established it with `isIP`; re-deriving it here from a colon typed
 * `1.2.3.4:445` as IPv6, and the v6 branch then called a private host:port
 * globally routable.
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
   *
   * **Because a stored row cannot always answer the strong one.** `systems` has
   * no domain column, so a host written from an earlier import is keyed on its
   * name alone -- and an incoming `web01` in `corp.example` would never match
   * it, importing a second copy of a host already in the case. Matching walks
   * this list; writing uses the first.
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
 *
 * **Blank fields are dropped rather than sent.** A collection's schema defaults
 * an absent field and refuses an empty one where it is required, so sending
 * `''` for everything unmapped would turn a thin entity into a validation
 * failure rather than a thin row.
 */
export function mapEntity(entity: ParsedEntity): MappedEntity | null {
  const mapping = MAPPINGS[entity.kind]

  const fields = Object.fromEntries(
    Object.entries(mapping.fields(entity.properties)).filter(([, value]) => value !== ''),
  )

  /**
   * **Derived from the row this became, not from the payload it came from.**
   *
   * An identity read from the provider's own properties asks a question the
   * stored row cannot answer, so the candidate and the row already in the case
   * would be keyed differently and never match. `identitiesOf` reads columns,
   * and it is `collections/identity.ts`'s -- the module every importer uses,
   * so a second copy cannot grow its own rules about IPv6 case, which field a
   * malware row keys on, or whether an account needs its domain.
   */
  const identities = identitiesOf(mapping.collection, fields)
  const strongest = identities[0]
  if (!strongest) return null

  return {
    collection: mapping.collection,
    fields,
    /**
     * **The row's own leading value, not a slice of the identity.**
     *
     * Slicing the identity means splitting on a separator this file does not
     * own -- `identitiesOf` joins on `identity.ts`'s -- and a split that never
     * divides renders an entity with no label of its own as a blank row.
     *
     * Each mapping lists its identifying field first, so the first value the
     * row holds is the thing an analyst would recognise it by.
     */
    label: mapping.label(entity.properties) || firstValue(fields),
    identity: strongest,
    identities,
  }
}

/**
 * Every mapping names a real collection, and every field it produces is one
 * that collection has.
 *
 * Exported rather than asserted inline so the check is a test's to run: this is
 * the property that makes the tables safe, and it belongs where it goes red.
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
