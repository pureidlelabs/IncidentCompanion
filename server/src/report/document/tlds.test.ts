import { describe, expect, it } from 'vitest'

import { ROOT_ZONE, ROOT_ZONE_COUNT, ROOT_ZONE_VERSION } from './tlds.js'

describe('the vendored root zone', () => {
  it('names the IANA version it was taken from', () => {
    expect(ROOT_ZONE_VERSION).toMatch(/^\d{10}$/)
  })

  it('holds exactly the number of domains its header states, each once and lower-case', () => {
    const entries = ROOT_ZONE.trim().split(/\s+/)
    expect({
      count: entries.length,
      distinct: new Set(entries).size,
      cased: entries.filter((one) => one !== one.toLowerCase()),
    }).toEqual({
      count: ROOT_ZONE_COUNT,
      distinct: ROOT_ZONE_COUNT,
      cased: [],
    })
  })
})
