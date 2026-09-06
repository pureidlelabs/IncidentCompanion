/**
 * What an entity's identity has to be made of.
 *
 * **An identity has to be answerable by the row it is stored as.** One built
 * out of the provider's raw payload, from fields the row does not keep, asks
 * dedup a question the stored side can never answer: a re-import matches
 * nothing and the case grows a second copy, through one importer's own door
 * with no second importer involved.
 */
import { describe, expect, it } from 'vitest'

import { parseEntity } from './providers/sentinel/entities.js'
import { mapEntity } from './providers/sentinel/mapping.js'

const entity = (kind: string, properties: Record<string, unknown>) =>
  parseEntity({ kind, id: `e-${kind}`, name: `e-${kind}`, properties })

function mapped(kind: string, properties: Record<string, unknown>) {
  const parsed = entity(kind, properties)
  return parsed ? mapEntity(parsed) : null
}

describe('an entity identity', () => {
  /**
   * **A `Url` and a `DnsResolution` for one host are two rows.** Reducing the
   * URL to its host merges them and the path has nowhere left to go, so two
   * paths on one host become one indicator.
   *
   * The STIX export splits them the same way -- `collect()` emits a URL and a
   * host as independent entries, because a blocklist acts on them separately.
   * What the split costs is the automatic link between a URL and its host's
   * row, and nothing recreates it.
   */
  it('gives a Url and a DnsResolution for one host different identities', () => {
    const url = mapped('Url', { url: 'https://evil.example.com/login' })
    const dns = mapped('DnsResolution', { domainName: 'evil.example.com' })
    expect(url?.identities).not.toContain(dns?.identities[0])
  })

  /**
   * The identity a stored row can answer to, asserted against the mapped
   * fields rather than against a literal -- the property is that the two
   * agree, not that either is a particular string.
   */
  it('builds a Url identity out of what the row actually stores', () => {
    const url = mapped('Url', { url: 'https://evil.example.com/login' })
    expect(url?.identities.some((one) => one.includes(String(url.fields['value'])))).toBe(true)
    expect(url?.identities.some((one) => one.includes('/login'))).toBe(true)
  })

  /** Sentinel URL entities are routinely defanged or scheme-less. */
  it('takes a URL with no scheme rather than mapping it to nothing', () => {
    const bare = mapped('Url', { url: 'www.evil.example.com' })
    expect(bare?.fields['value']).toBe('www.evil.example.com')
  })

  it('takes a scheme-less URL carrying a path', () => {
    const bare = mapped('Url', { url: 'evil.example.com/a/b' })
    expect(bare?.fields['value']).toBe('evil.example.com/a/b')
  })

  it('maps nothing at all when no host can be found', () => {
    expect(mapped('Url', { url: '' })).toBeNull()
  })
})
