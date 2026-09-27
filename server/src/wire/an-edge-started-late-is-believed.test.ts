/**
 * The edge starting after the application, with the resolver standing in for
 * the compose network's so the test decides when the edge's name starts to
 * answer. `tests/docker/test_ingress.py` drives the same on the shipped stack.
 */
import { beforeEach, expect, it, vi } from 'vitest'

const { answering, lookup } = vi.hoisted(() => {
  const answering: { address: string; family: number }[] = []
  const lookup = vi.fn(async () => {
    if (answering.length === 0) throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' })
    return [...answering]
  })
  return { answering, lookup }
})
vi.mock('node:dns/promises', () => ({ lookup }))

import { attribute, callerAddress, findTheEdge } from './caller-address.js'

beforeEach(async () => {
  answering.length = 0
  await findTheEdge('nginx')
  lookup.mockClear()
})

it('believes an edge that was not there at boot from its first request', async () => {
  answering.push({ address: '10.9.0.2', family: 4 })
  const headers = { 'x-forwarded-for': '203.0.113.9' }

  await attribute(headers, '10.9.0.2')

  expect(callerAddress(headers)).toBe('203.0.113.9')
})

it('looks the edge up at most once for a flood from one caller that is not it', async () => {
  for (let n = 0; n < 50; n++) await attribute({}, '10.9.0.7')

  expect(lookup.mock.calls.length).toBeLessThanOrEqual(1)
})
