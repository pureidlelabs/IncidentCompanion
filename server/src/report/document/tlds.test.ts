import { describe, expect, it } from 'vitest'

import { ROOT_ZONE, ROOT_ZONE_COUNT, ROOT_ZONE_VERSION } from './tlds.js'

describe('the vendored root zone', () => {
  it('names the IANA version it was taken from', () => {
    expect(ROOT_ZONE_VERSION).toMatch(/^\d{10}$/)
  })

  it('holds exactly the number of domains its header states, each once and lower-case', () => {
    expect({
      count: ROOT_ZONE.length,
      distinct: new Set(ROOT_ZONE).size,
      cased: ROOT_ZONE.filter((one) => one !== one.toLowerCase() || one.trim() !== one || one === ''),
    }).toEqual({
      count: ROOT_ZONE_COUNT,
      distinct: ROOT_ZONE_COUNT,
      cased: [],
    })
  })
})
