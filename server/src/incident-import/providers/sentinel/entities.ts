/**
 * Sentinel's entities, parsed rather than filtered.
 */
import { z } from 'zod'

/**
 * **Coerced, because the schema's own types are not all strings and the wire
 * is JSON.**
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
