/**
 * What an entity's identity has to be made of.
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
   * **P7 is retired, and this records why rather than deleting it.**
   */
  it('gives a Url and a DnsResolution for one host different identities', () => {
    const url = mapped('Url', { url: 'https://evil.example.com/login' })
    const dns = mapped('DnsResolution', { domainName: 'evil.example.com' })
    expect(url?.identities).not.toContain(dns?.identities[0])
  })

  /**
   * P6 -- the identity a stored row can answer to.
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
