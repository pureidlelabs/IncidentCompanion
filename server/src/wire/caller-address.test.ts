/**
 * Which address a request is attributed to, attacked from both sides: a
 * caller presenting somebody else's address, and the edge's account being
 * lost so that everybody becomes the edge.
 *
 * The booted halves are `test/a-caller-is-attributed-to-itself.test.ts` and
 * `test/the-edge-names-the-caller.test.ts`; `tests/docker/test_ingress.py`
 * drives the shipped edge.
 */
import type { IncomingHttpHeaders } from 'node:http'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { attribute, callerAddress, findTheEdge } from './caller-address.js'

const attributed = async (headers: IncomingHttpHeaders, peer: string): Promise<string | null> => {
  await attribute(headers, peer)
  return callerAddress(headers)
}

describe('behind an edge', () => {
  beforeAll(async () => {
    await findTheEdge('localhost')
  })

  afterAll(async () => {
    await findTheEdge(undefined)
  })

  it('believes the address the edge forwarded', async () => {
    expect(await attributed({ 'x-forwarded-for': '203.0.113.9' }, '127.0.0.1')).toBe('203.0.113.9')
  })

  it('compares an IPv4-mapped peer as the address it maps', async () => {
    expect(await attributed({ 'x-forwarded-for': '203.0.113.9' }, '::ffff:127.0.0.1')).toBe(
      '203.0.113.9',
    )
  })

  it.each([
    ['x-forwarded-for', '203.0.113.9'],
    ['x-forwarded-for', '203.0.113.9, 127.0.0.1'],
    ['x-real-ip', '203.0.113.9'],
  ])(
    'attributes a caller that is not the edge to itself, whatever %s says',
    async (name, value) => {
      expect(await attributed({ [name]: value }, '198.51.100.4')).toBe('198.51.100.4')
    },
  )
})

describe('with no edge named', () => {
  it('attributes every caller to itself', async () => {
    expect(await attributed({ 'x-forwarded-for': '203.0.113.9' }, '198.51.100.4')).toBe(
      '198.51.100.4',
    )
  })

  it.each(['x-real-ip', 'cf-connecting-ip', 'forwarded', 'true-client-ip'])(
    'reads no address from %s',
    (name) => {
      expect(callerAddress({ [name]: '203.0.113.9' })).not.toBe('203.0.113.9')
    },
  )
})
