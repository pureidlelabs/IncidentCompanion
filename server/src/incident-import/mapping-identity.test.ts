/**
 * What an entity's identity has to be made of.
 *
 * **Written from the adversarial review's probe table, before the fix.** The
 * rule the failures share: an identity built from the provider's raw payload
 * cannot be reconstructed from the row that payload became, so dedup asks a
 * question the stored side can never answer.
 *
 * A `Url` identified by its full URL writes a row holding only the host. On a
 * re-import the stored row offers `evil.example.com` and the candidate asks for
 * `https://evil.example.com/login`, so nothing matches and the case grows a
 * second copy -- through one importer's own door, with no second importer
 * involved.
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
   * **P7 is retired, and this records why rather than deleting it.** It held
   * *one host, two kinds, one row*: a `Url` was reduced to its host so it
   * merged with a `DnsResolution` for the same name. That was a workaround for
   * having no `url` kind -- the path had nowhere to go, so it went into
   * `context` as prose and two paths on one host were one indicator.
   *
   * They are two rows now, which is what the STIX export already did with
   * them: `collect()` emits a URL and a host as independent entries, because a
   * blocklist acts on them separately. What is lost is the automatic link
   * between a URL and its host's row, and nothing recreates it.
   */
  it('gives a Url and a DnsResolution for one host different identities', () => {
    const url = mapped('Url', { url: 'https://evil.example.com/login' })
    const dns = mapped('DnsResolution', { domainName: 'evil.example.com' })
    expect(url?.identities).not.toContain(dns?.identities[0])
  })

  /**
   * P6 -- the identity a stored row can answer to.
   *
   * **The property survives the change and its assertion inverts.** The row
   * used to keep only a host, so the identity had to exclude the path; it
   * keeps the whole URL now, so the identity has to include it. Asserted
   * against the mapped fields rather than a literal, because the point is that
   * the two agree.
   */
  it('builds a Url identity out of what the row actually stores', () => {
    const url = mapped('Url', { url: 'https://evil.example.com/login' })
    expect(url?.identities.some((one) => one.includes(String(url.fields['value'])))).toBe(true)
    expect(url?.identities.some((one) => one.includes('/login'))).toBe(true)
  })

  /** P9 -- Sentinel URL entities are routinely defanged or scheme-less. */
  it('takes a URL with no scheme rather than mapping it to nothing', () => {
    const bare = mapped('Url', { url: 'www.evil.example.com' })
    expect(bare?.fields['value']).toBe('www.evil.example.com')
  })

  /** P10 -- and one with a path but no scheme, which now keeps the path. */
  it('takes a scheme-less URL carrying a path', () => {
    const bare = mapped('Url', { url: 'evil.example.com/a/b' })
    expect(bare?.fields['value']).toBe('evil.example.com/a/b')
  })

  it('maps nothing at all when no host can be found', () => {
    expect(mapped('Url', { url: '' })).toBeNull()
  })
})
