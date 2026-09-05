import type { Collection } from '../domain/collections.js'
import { withoutInvisibles } from '../domain/invisible.lists.js'

/**
 * "Have I already got this host, account, indicator?" - asked by every importer.
 */

/**
 * The collections that have an identity, and the field(s) it is made of.
 */
const KEYED: Partial<Record<Collection, readonly string[]>> = {
  systems: ['hostname'],
  accounts: ['accountName', 'domain'],
  network_indicators: ['value', 'type'],
  malware: ['hash'],
  cloud_apps: ['appName'],
} as const

/**
 * Fields compared as typed, keyed by collection. See the header on IPv6.
 */
const CASE_SENSITIVE = new Set(['network_indicators.value'])

/**
 * How a row may be recognised, beyond the one key `keyOf` answers with.
 */
const LADDERS: Partial<
  Record<
    Collection,
    readonly { fields: readonly string[]; floor: number; only?: string }[]
  >
> = {
  systems: [{ fields: ['hostname'], floor: 1 }],
  // The pair, and never less than the pair.
  accounts: [{ fields: ['accountName', 'domain'], floor: 2 }],
  /**
   * **The kind is part of the key.**
   */
  network_indicators: [{ fields: ['value', 'type', 'scope'], floor: 2 }],
  /**
   * **Exclusive: a row with a hash is known by its hash and not also by its
   * name.**
   */
  malware: [
    { fields: ['hash', 'signature'], floor: 1, only: 'hash' },
    { fields: ['filename', 'family'], floor: 1 },
  ],
  cloud_apps: [{ fields: ['appName', 'instance'], floor: 1 }],
} as const

/**
 * Every field an identity is made of, keyed and laddered alike.
 */
export const IDENTITY_FIELDS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  [...new Set([...Object.keys(KEYED), ...Object.keys(LADDERS)])].map((collection) => [
    collection,
    [
      ...new Set([
        ...(KEYED[collection as Collection] ?? []),
        ...(LADDERS[collection as Collection] ?? []).flatMap((rung) => rung.fields),
      ]),
    ],
  ]),
)

export type IdentityKey = string

/**
 * **NUL, spelled as an escape.**
 */
const SEPARATOR = '\u0000'

/**
 * One field of a row, trimmed, and lowercased unless the pair is case-kept.
 */
function normalised(collection: string, row: Record<string, unknown>, field: string): string {
  const raw = row[field]
  // **Stripped before trimming, on both doors onto this key.** `keyOf` runs on
  // a mapped provider row that no schema has parsed, so the normaliser the
  // columns carry has not run yet - and an invisible character at the end
  // leaves ordinary space stranded in front of it, where `.trim()` cannot
  // reach. -> `domain/pasted.ts`
  const text = typeof raw === 'string' ? withoutInvisibles(raw).trim() : ''
  return CASE_SENSITIVE.has(`${collection}.${field}`) ? text : text.toLowerCase()
}

/**
 * The key a row is known by, or `null` when it has none.
 */

export function keyOf(collection: string, row: Record<string, unknown>): IdentityKey | null {
  const fields = KEYED[collection as keyof typeof KEYED]
  if (!fields) return null

  const parts = fields.map((field) => normalised(collection, row, field))

  // **The *first* field is the identity; the rest qualify it.** An account with
  // a name and no domain is still an account, and matches another of the same
  // name with no domain. An account with a domain and no name is not one.
  if (!parts[0]) return null
  // **NUL as the separator, spelled as an escape.** Nothing in a hostname,
  // an account name or an address can be a NUL, so two keys cannot collide
  // by a value containing the separator - which any printable choice risks.
  // Typed as the byte it is refused by `test_source_hygiene`, and typing it
  // into a template literal is how two spaces became NULs here in the first
  // place. -> `rules/git-workflow.md` section 4
  return [collection, ...parts].join(SEPARATOR)
}

/**
 * The identities a row answers to, strongest first.
 */
export function identitiesOf(collection: string, row: Record<string, unknown>): IdentityKey[] {
  const alternatives = LADDERS[collection as keyof typeof LADDERS]
  if (!alternatives) return []

  const value = (field: string) => normalised(collection, row, field)

  const out: IdentityKey[] = []
  for (const { fields, floor, only } of alternatives) {
    // **`only` makes an alternative exclusive.** A row that has the field it
    // names is known by it and by nothing weaker; a row that does not falls
    // through to the next alternative.
    if (only && value(only) === '') continue

    const parts = fields.map(value)
    // The leading field is the identity; without it this alternative says
    // nothing, exactly as `keyOf` returns null for the same reason.
    if (!parts[0]) continue

    const held = parts.filter((part, at) => at === 0 || part !== '')
    if (held.length < floor) {
      /**
       * **Below its floor the row still has an identity -- `keyOf`'s own.**
       */
      out.push([collection, ...parts].join(SEPARATOR))
    } else {
      for (let count = held.length; count >= floor; count -= 1) {
        out.push([collection, ...held.slice(0, count)].join(SEPARATOR))
      }
    }
    if (only) break
  }
  return out
}

/** True when this collection has any notion of a duplicate. */
export function hasIdentity(collection: string): boolean {
  return collection in KEYED
}

/**
 * Index the rows already in the case, so an import can ask once per row.
 */
export interface Known {
  readonly id: string
  /**
   * **Carried because a replace has to present it.**
   */
  readonly version: number
}

export function indexOf(
  collection: string,
  existing: readonly Record<string, unknown>[],
): Map<IdentityKey, Known> {
  const index = new Map<IdentityKey, Known>()
  for (const row of existing) {
    const key = keyOf(collection, row)
    // **First wins.** If the case already holds two rows with one key - which
    // it can, since nothing enforced this before now - an import must not pick
    // arbitrarily between them on each run.
    if (key !== null && !index.has(key)) {
      // Read as the types they are rather than stringified: an `id` that is
      // not a string is a row this has no business indexing.
      const id = typeof row['id'] === 'string' ? row['id'] : ''
      const version = typeof row['version'] === 'number' ? row['version'] : 0
      index.set(key, { id, version })
    }
  }
  return index
}
