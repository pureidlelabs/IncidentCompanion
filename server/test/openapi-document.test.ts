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
 * `minimal` plus the ones that caught something, and `tag-description` left
 * off.
 *
 * Every tag is derived from a route pattern, so describing all 39 means a
 * name-to-sentence map with no declaration site to hang it on -- and a new
 * collection would appear undescribed while a renamed one left a dangling key.
 *
 * **A rule name Redocly does not know is ignored in silence.** A misspelling
 * here does not fail the run and does not warn: the lint passes having applied
 * one rule fewer, which is a check reporting success by not running. Verified
 * both ways -- an invented `this-rule-does-not-exist: error` left this file
 * green, and `tag-description: error` reddened it -- so every name below is
 * checked against `@redocly/openapi-core/lib/rules/oas3/index.js` rather than
 * remembered. In a tool that drops unknown keys, a misspelled real rule and an
 * absent one are indistinguishable.
 *
 * **Second tool in this tree to do it**, so treat it as a class rather than a
 * quirk: `CLAUDE.md` records Vale applying no style at all when run from a
 * subdirectory, because every section heading in `.vale.ini` is a path glob
 * anchored at the root -- it walks every file and reports zero errors.
 *
 * The three `operationId` rules are what a generator needs beyond a valid
 * structure: it names each method after that id, so a missing or duplicate one
 * produces a client somebody has to edit by hand.
 */
const RULES = {
  struct: 'error',
  'operation-operationId-unique': 'error',
  'operation-operationId': 'error',
  'operation-operationId-url-safe': 'error',
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
