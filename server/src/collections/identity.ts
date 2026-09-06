import type { Collection } from '../domain/collections.js'
import { withoutInvisibles } from '../domain/invisible.lists.js'

/**
 * "Have I already got this host, account, indicator?" - asked by every importer.
 *
 * **Its own module, because every importer has to answer it the same way** - a
 * second door disagreeing silently doubles the case on a re-import.
 *
 * **Only the five in `KEYED` have an identity at all.** Everything else - the
 * timeline, actions, notes, evidence, impact, reports and their blocks - is an
 * event or a judgement rather than a thing, so two rows that look alike are two
 * facts and merging them would lose one. `keyOf` returns `null` for those, and
 * a null key never matches anything, including another null.
 *
 * The rules are specific in ways that look arbitrary and are not:
 *
 * | collection | key |
 * | --- | --- |
 * | `systems` | `hostname`, trimmed and lowercased |
 * | `accounts` | the **pair** `(accountName, domain)`, both lowercased |
 * | `network_indicators` | the **pair** `(value, type)`, value trimmed only |
 * | `malware` | `hash`, trimmed and lowercased |
 * | `cloud_apps` | `appName`, trimmed and lowercased |
 *
 * **An account is the pair.** `admin@corp.local` and `admin@partner.local` are
 * two accounts; keying on the name alone merges an intruder's account into the
 * customer's.
 *
 * **An indicator's value keeps its case**, where every other key is
 * lowercased. `FE80::1` and `fe80::1` are the same address, but lowercasing
 * without also collapsing `::ffff:0:0` and the zero-run rules is half a
 * normalisation that looks like a whole one. The same holds now that one
 * column carries every kind: a URL's path is case-sensitive where its host is
 * not, so lowercasing the value is half a normalisation there too. Trim and
 * stop. A per-kind normaliser is the complete answer, and nothing has needed
 * it -- `EVIL.example` and `evil.example` are two rows until it exists.
 *
 * **An empty value is no identity, not an identity of "".** Two systems with a
 * blank hostname are two systems. Keying them together is how an import of
 * partially-filled rows collapses into one.
 */

/**
 * The collections that have an identity, and the field(s) it is made of.
 *
 * **Typed against `Collection`, because this repository has already shipped
 * this exact defect under these exact two spellings.** `registry.ts` records a
 * map written with the import names `cloudApps` and `networkIndicators` while
 * every other vertex spelled them `cloud_apps` and `network_indicators`: both
 * lookups missed and the walk dropped the field silently.
 *
 * Here the same slip turns dedup *off* for a collection - a re-import quietly
 * doubling a table, which is the defect this module exists to prevent. The
 * annotation is the only thing that catches it: typed as a plain record,
 * mutating `cloud_apps` to `cloudApps` leaves the server suite and the
 * typecheck green.
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
 *
 * **Qualified, because `value` is not a rare column name.** `ip` was unique to
 * one table; `value` exists on auth and preferences rows too, so a bare field
 * name would silently stop lowercasing the day another collection gained one --
 * and the symptom is a table that doubles on re-import.
 */
const CASE_SENSITIVE = new Set(['network_indicators.value'])

/**
 * How a row may be recognised, beyond the one key `keyOf` answers with.
 *
 * Each entry is an alternative: a network indicator is known by its address
 * *or* by its domain, a malware row by its hash *or* by its filename. Within
 * an alternative the fields run strongest first and `floor` says how many may
 * never be dropped.
 *
 * **Only fields the table actually has.** A Sentinel host carries a DNS domain
 * and `systems` has no column for it, so it cannot appear here -- an identity
 * naming a column the stored row lacks is one the stored row can never answer.
 */
const LADDERS: Partial<
  Record<
    Collection,
    readonly { fields: readonly string[]; floor: number; only?: string }[]
  >
> = {
  systems: [{ fields: ['hostname'], floor: 1 }],
  accounts: [{ fields: ['accountName', 'domain'], floor: 2 }],
  /**
   * **The kind is part of the key.** With the value alone, `1.2.3.4` seen as
   * an address and `1.2.3.4` seen as a domain were one indicator. `scope`
   * strengthens a private address, which repeats across every site.
   *
   * **The value leads, and that is load-bearing rather than cosmetic.** A row
   * with no identity is recognised by an empty *leading* field, and `type`
   * always has one -- it defaults to `domain` and every mapping sets it. Led
   * by `type`, an indicator with no value keyed happily on its kind alone, and
   * preview offered a row the collection would refuse with a 422.
   */
  network_indicators: [{ fields: ['value', 'type', 'scope'], floor: 2 }],
  /**
   * **Exclusive: a row with a hash is known by its hash and not also by its
   * name.** Both alternatives ran, so a stored binary exposed
   * `malware<NUL>svchost.exe` as a weaker rung and a *different* binary of
   * that name matched it -- read as a duplicate and silently not imported.
   * Two files of one name are two files.
   *
   * **This position is also wrong, and it is held because it fails visibly.**
   * Sentinel's `Malware` entity carries a name and no hash while its `File`
   * entity carries both, so the two can no longer match and one binary imports
   * as two rows. A ladder chooses its rungs before it knows what it is being
   * compared against, and the rule this needs is about a pair.
   */
  malware: [
    { fields: ['hash', 'signature'], floor: 1, only: 'hash' },
    { fields: ['filename', 'family'], floor: 1 },
  ],
  cloud_apps: [{ fields: ['appName', 'instance'], floor: 1 }],
} as const

/**
 * Every field an identity is made of, keyed and laddered alike.
 *
 * **Published so the columns can be held to it.** A field here is compared
 * across two rows, so a character nobody can see in one of them is a row that
 * never matches itself -- and the check that the columns strip them reads this
 * list rather than repeating it.
 * -> `domain/entities/identity-fields-are-pasted.test.ts`
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
 * **NUL, spelled as an escape.** Nothing in a hostname, an account name or an
 * address can be a NUL, so two keys cannot collide by a value containing the
 * separator -- which any printable choice risks. Typed as the byte it is
 * refused by `test_source_hygiene`, and typing it into a template literal is
 * how two spaces became NULs here in the first place.
 * -> `rules/git-workflow.md` section 4
 */
const SEPARATOR = '\u0000'

/**
 * One field of a row, trimmed, and lowercased unless the pair is case-kept.
 *
 * Shared by `keyOf` and `identitiesOf`: they normalised identically in two
 * places, so `CASE_SENSITIVE` had two readers that had to stay in step.
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
 *
 * **`null` for a keyless collection *and* for a keyed row with an empty
 * leading field**, which are different reasons for the same answer: neither
 * may ever match another row.
 */

export function keyOf(collection: string, row: Record<string, unknown>): IdentityKey | null {
  const fields = KEYED[collection as keyof typeof KEYED]
  if (!fields) return null

  const parts = fields.map((field) => normalised(collection, row, field))

  // **The *first* field is the identity; the rest qualify it.** An account with
  // a name and no domain is still an account, and matches another of the same
  // name with no domain. An account with a domain and no name is not one.
  if (!parts[0]) return null
  return [collection, ...parts].join(SEPARATOR)
}

/**
 * The identities a row answers to, strongest first.
 *
 * **`keyOf` asks one question; this asks every question the row can answer.**
 * A provider gives more than the table keeps -- a host arrives with a domain
 * the `systems` table has no column for -- so an incoming row keyed on
 * everything it knows would never match a stored row keyed on less. The ladder
 * is what lets the strong form try first and the weak form still match.
 *
 * **The floor is what stops a ladder becoming a merge.** An account is the
 * pair: dropping the domain would make `admin@corp.local` match
 * `admin@partner.local`, which is the defect the header above names. So each
 * alternative declares how many leading fields are mandatory, and the ladder
 * never drops below it.
 *
 * **The weakest form of the primary alternative is `keyOf`'s own answer**, so
 * the two doors agree by construction rather than by two tables kept in step.
 * Two tables is what a second implementation of this becomes, and it diverges
 * a field at a time -- a lowercased value here, one fewer key field there,
 * a ladder run down past its floor.
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
       * The floor caps how weak a *match* may be, not whether the row can be
       * named at all. An account with no domain answers to
       * `accounts<NUL>svc_backup<NUL>`, which matches another domainless
       * account of that name and never `admin@corp.local`. Returning nothing
       * here drops every local and service account from an import silently,
       * and breaks this module's own claim that the weakest rung is `keyOf`'s.
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

export function hasIdentity(collection: string): boolean {
  return collection in KEYED
}

/**
 * Index the rows already in the case, so an import can ask once per row.
 *
 * **Built from what is already there, not from what is arriving.** Two
 * incoming rows that match *each other* are handled by the caller adding to
 * this index as it accepts them - otherwise a file listing the same host twice
 * imports it twice, which is the same defect through a different door.
 */
export interface Known {
  readonly id: string
  /**
   * **Carried because a replace has to present it.** Every write in this app
   * offers the version it read and the server refuses one that does not match;
   * an import that replaced without it would be the one writer allowed to
   * overwrite an analyst's concurrent edit silently.
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
    // **First wins.** The case can already hold two rows with one key, since
    // no column constraint enforces an identity, and an import must not pick
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
