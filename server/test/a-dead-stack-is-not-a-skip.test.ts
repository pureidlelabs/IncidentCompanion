import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { requireServedApp } from '../e2e/support/app.js'

/**
 * A certifying run refuses a stack it cannot reach rather than skipping it.
 * The unarmed direction is not asserted: it reaches Playwright's `test.info()`.
 */
beforeEach(() => {
  vi.stubEnv('IC_SUITE_MUST_RUN', '1')
  vi.stubEnv('VISUAL_TARGET', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

it('refuses rather than skipping when it cannot reach the app', async () => {
  await expect(requireServedApp('')).rejects.toThrow(/no baseURL/)
})

it('refuses when nothing answers at the address it was given', async () => {
  await expect(requireServedApp('http://127.0.0.1:1')).rejects.toThrow(/no app answering/)
})
