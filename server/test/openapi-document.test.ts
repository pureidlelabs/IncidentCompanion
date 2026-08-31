/**
 * Lint the published document against Redocly's OpenAPI rules.
 *
 * Driven against the real document rather than a fixture: every rule here is a
 * property of the whole surface, and one operation cannot tell whether its id
 * is unique or whether the version supports the keyword its schema emitted.
 */
import { createConfig, lintFromString } from '@redocly/openapi-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, type Harness } from './app-harness.js'

const runnable = await bootable()

/**
 * `minimal` plus the four that caught something, and `tag-description` left
 * off.
 *
 * Every tag is derived from a route pattern, so describing all 39 means a
 * name-to-sentence map with no declaration site to hang it on -- and a new
 * collection would appear undescribed while a renamed one left a dangling key.
 */
const RULES = {
  struct: 'error',
  'operation-operationId-unique': 'error',
  'no-empty-servers': 'error',
  'info-license': 'error',
  'tag-description': 'off',
} as const

describe.skipIf(!runnable)('the published document', () => {
  let harness: Harness

  beforeAll(async () => {
    harness = await boot()
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('lints clean, so a generated client can be built from it', async () => {
    const config = await createConfig({ extends: ['minimal'], rules: RULES })
    const found = await lintFromString({
      source: JSON.stringify(harness.document),
      config,
    })

    const errors = found
      .filter((one) => one.severity === 'error')
      .map((one) => `${one.location[0]?.pointer ?? '?'}: ${one.message}`)
    expect(errors).toEqual([])
  })
})
