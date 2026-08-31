/**
 * Sentinel's entities, parsed rather than filtered.
 *
 * **This is the file the string door became.** The client used to flatten
 * `properties` and keep only string values, which discarded every `Int`,
 * `Bool`, `List` and nested entity the schema declares -- `SaasId`,
 * `IsDomainJoined`, `Location`, `FileHashes`, `SizeInBytes`. It did that
 * because the payload had to cross into a tier with no knowledge of the target
 * schemas. It does not cross any more: the browser posts what ARM sent and this
 * parses it where the schemas are.
 *
 * **Per kind, and unknown kinds are counted rather than dropped in silence.**
 * Twenty entity types are documented and this maps the ones with a home in a
 * case; the rest are reported to the analyst as skipped, so a payload full of
 * mailboxes does not read as an empty incident.
 *
 * -> https://learn.microsoft.com/en-us/azure/sentinel/entities-reference
 */
import { z } from 'zod'

/**
 * **Coerced, because the schema's own types are not all strings and the wire
 * is JSON.** `SaasId` and `InstanceId` are `Int`, `IsDomainJoined` is `Bool`,
 * and a provider that answers `"11161"` for one workspace and `11161` for the
 * next is not a case worth failing an import over.
 */
const text = z.coerce.string().trim().default('')
const flag = z.coerce.boolean().optional()

/** ARM wraps every entity as `{ kind, properties: {...} }`, with ids beside. */
const envelope = z.object({
  kind: z.string().trim().default(''),
  id: z.string().trim().default(''),
  name: z.string().trim().default(''),
  properties: z.record(z.string(), z.unknown()).default({}),
})

export const hostProperties = z.object({
  hostName: text,
  netBiosName: text,
  dnsDomain: text,
  ntDomain: text,
  azureID: text,
  omsAgentID: text,
  osFamily: text,
  osVersion: text,
  isDomainJoined: flag,
  friendlyName: text,
})

export const accountProperties = z.object({
  accountName: text,
  name: text,
  ntDomain: text,
  dnsDomain: text,
  upnSuffix: text,
  sid: text,
  aadUserId: text,
  puid: text,
  objectGuid: text,
  isDomainJoined: flag,
  friendlyName: text,
})

/** `Location` is an object; only the parts an analyst would read are kept. */
export const ipProperties = z.object({
  address: text,
  addressScope: text,
  location: z
    .object({ countryName: text, city: text, asn: z.coerce.string().optional() })
    .partial()
    .optional(),
  friendlyName: text,
})

export const fileHashProperties = z.object({
  algorithm: text,
  hashValue: text,
  friendlyName: text,
})

export const cloudApplicationProperties = z.object({
  appName: text,
  name: text,
  saasId: text,
  appId: text,
  instanceName: text,
  instanceId: text,
  risk: text,
  friendlyName: text,
})

/** `Name + Category`, which is what the malware table is actually shaped for. */
export const malwareProperties = z.object({
  name: text,
  category: text,
  friendlyName: text,
})

export const fileProperties = z.object({
  name: text,
  directory: text,
  sizeInBytes: z.coerce.number().optional(),
  fileHashes: z
    .array(z.object({ properties: z.object({ hashValue: text, algorithm: text }).partial() }))
    .default([]),
  friendlyName: text,
})

export const urlProperties = z.object({ url: text, friendlyName: text })

export const dnsProperties = z.object({ domainName: text, friendlyName: text })

/** Every kind this can read, with the schema that reads it. */
export const ENTITY_SCHEMAS = {
  Host: hostProperties,
  Account: accountProperties,
  Ip: ipProperties,
  FileHash: fileHashProperties,
  CloudApplication: cloudApplicationProperties,
  Malware: malwareProperties,
  File: fileProperties,
  Url: urlProperties,
  DnsResolution: dnsProperties,
} as const

export type SentinelKind = keyof typeof ENTITY_SCHEMAS

/**
 * ARM spells a kind in more than one way across APIs and versions.
 *
 * **An alias table rather than a normaliser**, because the spellings are not
 * derivable from one another: `Url` against `URL`, and `DnsResolution` against
 * the documented entity name `DNS`.
 *
 * A `Map` because the key is a vendor string: `if (!kind)` below is the guard
 * that a bare object gets past, and `parseEntity` promises never to throw.
 */
const ALIASES: ReadonlyMap<string, SentinelKind> = new Map(Object.entries({
  host: 'Host',
  account: 'Account',
  ip: 'Ip',
  filehash: 'FileHash',
  'file-hash': 'FileHash',
  cloudapplication: 'CloudApplication',
  'cloud-application': 'CloudApplication',
  malware: 'Malware',
  file: 'File',
  url: 'Url',
  dns: 'DnsResolution',
  dnsresolution: 'DnsResolution',
} as const))

export interface ParsedEntity {
  kind: SentinelKind
  /** ARM's own entity id, which alerts link by. */
  ref: string
  properties: Record<string, unknown>
}

/**
 * One entity, or `null` when this is a kind with no home in a case.
 *
 * A parse failure is also `null` rather than a throw: one malformed entity in
 * an incident of forty is a row to skip and count, not an import to refuse.
 */
export function parseEntity(raw: unknown): ParsedEntity | null {
  const outer = envelope.safeParse(raw)
  if (!outer.success) return null
  const kind = ALIASES.get(outer.data.kind.toLowerCase())
  if (!kind) return null

  const parsed = ENTITY_SCHEMAS[kind].safeParse(outer.data.properties)
  if (!parsed.success) return null
  return {
    kind,
    ref: outer.data.id || outer.data.name,
    properties: parsed.data,
  }
}
