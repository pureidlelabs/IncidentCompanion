/**
 * What counts as the same host, account or indicator.
 *
 * A round trip cannot see either: `keyOf` agrees with itself whatever it does.
 * So these are cases where two rows should or should not collide, chosen from
 * the rules rather than from examples that happen to work.
 */
import { describe, expect, it } from 'vitest'

import { hasIdentity, identitiesOf, indexOf, keyOf } from './identity.js'
import { REVIEWABLE } from './registry.js'

/** Collections an import may recognise a row of, as a decision. */
const HAS_IDENTITY = ['systems', 'accounts', 'malware', 'network_indicators', 'cloud_apps']

/** The rest, where two alike rows are two facts rather than one repeated. */
const HAS_NONE = [
  'actions',
  'casenotes',
  'evidence',
  'impact',
  'methods',
  'reports',
  'report_blocks',
  'timeline',
]

const same = (collection: string, a: Record<string, unknown>, b: Record<string, unknown>) =>
  keyOf(collection, a) !== null && keyOf(collection, a) === keyOf(collection, b)

describe('what makes two rows the same thing', () => {
  it('matches a host on its name whatever case and spacing it arrived in', () => {
    expect(same('systems', { hostname: 'WKS-FIN01' }, { hostname: '  wks-fin01 ' })).toBe(true)
  })

  it('does not match two hosts that merely share a prefix', () => {
    // The narrow direction: a key built by truncating or by `startsWith` would
    // merge a workstation into the server beside it.
    expect(same('systems', { hostname: 'WKS-FIN01' }, { hostname: 'WKS-FIN010' })).toBe(false)
  })

  it('keys an account on the pair, not on the name', () => {
    // **The expensive one.** `admin` at the customer and `admin` at a partner
    // domain are two accounts, and merging them puts an intruder's activity on
    // the customer's row - where nothing afterwards can tell they were two.
    expect(
      same(
        'accounts',
        { accountName: 'admin', domain: 'corp.local' },
        { accountName: 'admin', domain: 'partner.example' },
      ),
    ).toBe(false)
    expect(
      same(
        'accounts',
        { accountName: 'Admin', domain: 'CORP.local' },
        { accountName: 'admin', domain: 'corp.local' },
      ),
    ).toBe(true)
  })

  it('treats an account with no domain as its own thing, matching only others with none', () => {
    expect(same('accounts', { accountName: 'svc-backup' }, { accountName: 'svc-backup' })).toBe(true)
    expect(
      same('accounts', { accountName: 'svc-backup' }, { accountName: 'svc-backup', domain: 'corp' }),
    ).toBe(false)
  })

  it('keeps an address as typed, where every other key is lowercased', () => {
    // Deliberate, and the docstring says why: lowercasing IPv6 without also
    // normalising the zero-run and the mapped-IPv4 forms is half a
    // normalisation that reads as a whole one.
    expect(same('network_indicators', { type: 'ipv6', value: 'FE80::1' }, { type: 'ipv6', value: 'fe80::1' })).toBe(false)
    expect(same('network_indicators', { type: 'ipv4', value: ' 10.0.0.4 ' }, { type: 'ipv4', value: '10.0.0.4' })).toBe(true)
  })

  it('matches a cloud app on its name', () => {
    // The collection whose key spelling this repository has already got wrong
    // once, and the one most easily left untested.
    expect(same('cloud_apps', { appName: 'Dropbox' }, { appName: ' dropbox ' })).toBe(true)
    expect(same('cloud_apps', { appName: 'Dropbox' }, { appName: 'Box' })).toBe(false)
  })

  it('matches a hash however it was pasted', () => {
    expect(same('malware', { hash: 'ABCD1234' }, { hash: 'abcd1234' })).toBe(true)
  })
})

describe('what has no identity at all', () => {
  /**
   * **The two lists together are every collection, and that is what makes this a
   * sweep.**
   */
  it('accounts for every collection, so a new one forces the decision', () => {
    expect(new Set([...HAS_IDENTITY, ...HAS_NONE])).toEqual(new Set(Object.keys(REVIEWABLE)))
    expect(HAS_IDENTITY.filter((one) => HAS_NONE.includes(one))).toEqual([])
  })

  it.each(HAS_IDENTITY)('gives %s an identity to be recognised by', (collection) => {
    expect(hasIdentity(collection)).toBe(true)
  })

  it.each(HAS_NONE)('gives %s no key, because two alike rows are two facts', (collection) => {
    expect(hasIdentity(collection)).toBe(false)
    expect(keyOf(collection, { name: 'anything' })).toBeNull()
  })

  it('gives a keyed row with an empty identity no key either', () => {
    // **An absent hostname is not an identity of "".** Two half-filled rows are
    // two rows; keying them together is how an import of a partial file
    // collapses into one.
    expect(keyOf('systems', { hostname: '' })).toBeNull()
    expect(keyOf('systems', { hostname: '   ' })).toBeNull()
    expect(keyOf('systems', {})).toBeNull()
    expect(same('systems', { hostname: '' }, { hostname: '' })).toBe(false)
  })

  it('gives a domain with no account name no key', () => {
    // The first field is the identity and the rest qualify it, so this is not
    // an account at all rather than an account of the domain.
    expect(keyOf('accounts', { domain: 'corp.local' })).toBeNull()
  })
})

describe('indexing what the case already holds', () => {
  it('carries the version, which a replace has to present', () => {
    const index = indexOf('systems', [{ id: 'a', version: 7, hostname: 'WKS-01' }])
    expect(index.get(keyOf('systems', { hostname: 'wks-01' })!)).toEqual({ id: 'a', version: 7 })
  })

  it('keeps the first of two rows that already share a key', () => {
    // The case can hold duplicates from before this existed, and an import must
    // not pick between them differently on each run.
    const index = indexOf('systems', [
      { id: 'first', version: 1, hostname: 'WKS-01' },
      { id: 'second', version: 1, hostname: 'wks-01' },
    ])
    expect(index.size).toBe(1)
    expect(index.get(keyOf('systems', { hostname: 'WKS-01' })!)?.id).toBe('first')
  })

  it('indexes nothing for rows with no identity', () => {
    expect(indexOf('systems', [{ id: 'a', version: 1, hostname: '' }]).size).toBe(0)
  })
})

/**
 * The ladder both importers ask with, and the one rule that must not ladder.
 */
describe('the identities a row answers to', () => {
  /**
   * **An account is the pair, at every rung.**
   */
  it('never keys an account on its name without its domain', () => {
    const keys = identitiesOf('accounts', { accountName: 'admin', domain: 'corp.local' })
    expect(keys).toHaveLength(1)
    expect(keys).toEqual([keyOf('accounts', { accountName: 'admin', domain: 'corp.local' })])

    const other = identitiesOf('accounts', { accountName: 'admin', domain: 'partner.local' })
    expect(keys[0], 'two domains are two accounts').not.toBe(other[0])
  })

  /**
   * **The weakest rung is `keyOf`'s own answer**, which is what makes the two
   * doors agree by construction rather than by two tables being kept in step.
   */
  it('ends at the key the other importer asks with', () => {
    const row = { hostname: 'WKS-0142' }
    expect(identitiesOf('systems', row).at(-1)).toBe(keyOf('systems', row))
  })

  /**
   * **Re-anchored when the indicator stopped having two ways in.**
   */
  it('keys an indicator on its kind and value, with the scope as a rung above', () => {
    const unscoped = identitiesOf('network_indicators', { type: 'ipv4', value: '10.0.0.5' })
    const scoped = identitiesOf('network_indicators', {
      type: 'ipv4', value: '10.0.0.5', scope: 'branch-a',
    })
    expect(unscoped).toHaveLength(1)
    expect(scoped).toHaveLength(2)
    expect(scoped.at(-1)).toBe(unscoped[0])
  })

  /** The kind is in the key, so one value read two ways is two indicators. */
  it('does not merge an address with a domain that reads the same', () => {
    const address = identitiesOf('network_indicators', { type: 'ipv4', value: '1.2.3.4' })
    const domain = identitiesOf('network_indicators', { type: 'domain', value: '1.2.3.4' })
    expect(address).not.toEqual(domain)
  })

  /** The IPv6 rule the header states, asked through the ladder rather than
   *  through `keyOf`, because the import path is what lowercased it. */
  it('keeps an address as typed', () => {
    expect(identitiesOf('network_indicators', { type: 'ipv6', value: 'FE80::1' })[0]).toContain('FE80::1')
  })

  /** A qualifier that is present strengthens; its absence is not a key. */
  it('drops a qualifier that is empty rather than keying on emptiness', () => {
    const bare = identitiesOf('cloud_apps', { appName: 'Ledger', instance: '' })
    const qualified = identitiesOf('cloud_apps', { appName: 'Ledger', instance: 'EU' })
    expect(bare).toHaveLength(1)
    expect(qualified).toHaveLength(2)
    expect(qualified.at(-1)).toBe(bare[0])
  })

  it('answers nothing for a collection with no identity', () => {
    expect(identitiesOf('timeline', { description: 'anything' })).toEqual([])
  })
})

/**
 * The reviewer's probe table, written before the fixes.
 */
describe('the ladder agrees with keyOf, on every collection', () => {
  const rows: [string, Record<string, unknown>][] = [
    ['systems', { hostname: 'WKS-1' }],
    ['accounts', { accountName: 'admin', domain: 'corp.local' }],
    ['accounts', { accountName: 'svc_backup' }],
    ['network_indicators', { type: 'ipv4', value: '10.0.0.5' }],
    ['malware', { hash: 'aaaa' }],
    ['malware', { hash: 'aaaa', signature: 'sha256' }],
    ['cloud_apps', { appName: 'Ledger' }],
    ['cloud_apps', { appName: 'Ledger', instance: 'EU' }],
  ]

  it.each(rows)('%s %j ends at keyOf', (collection, row) => {
    const key = keyOf(collection, row)
    if (key === null) return
    expect(identitiesOf(collection, row).at(-1)).toBe(key)
  })

  /**
   * **A local account has no domain, and it is still an account.**
   */
  it('gives a domainless account an identity of its own', () => {
    const keys = identitiesOf('accounts', { accountName: 'svc_backup' })
    expect(keys, 'a local account is not identityless').not.toEqual([])
    expect(keys.at(-1)).toBe(keyOf('accounts', { accountName: 'svc_backup' }))
  })

  /** And it must not thereby match a domained account of the same name. */
  it('keeps a domainless account apart from a domained one', () => {
    const bare = identitiesOf('accounts', { accountName: 'admin' })
    const owned = identitiesOf('accounts', { accountName: 'admin', domain: 'corp.local' })
    expect(bare.some((key) => owned.includes(key)), 'no shared rung').toBe(false)
  })

  /**
   * **Two files of one name are two files.**
   */
  it('does not merge two hashes that share a filename', () => {
    const stored = identitiesOf('malware', { filename: 'svchost.exe', hash: 'AAAA', signature: 'SHA256' })
    const incoming = identitiesOf('malware', { filename: 'svchost.exe', hash: 'BBBB' })
    expect(stored.some((key) => incoming.includes(key)), 'no shared rung').toBe(false)
  })

  /** A row with no hash is still known by what it has. */
  it('keys a malware row with no hash on its filename', () => {
    expect(identitiesOf('malware', { filename: 'dropper.bin' })).not.toEqual([])
  })
})
