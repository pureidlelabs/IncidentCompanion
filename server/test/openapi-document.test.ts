/**
 * Lint the published document against Redocly's OpenAPI rules.
 */
import { createConfig, lintFromString } from '@redocly/openapi-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, type Harness } from './app-harness.js'

const runnable = await bootable()

/**
 * `minimal` plus the ones that caught something, and `tag-description` left
 * off.
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

  it('lints clean under every rule this document is held to', async () => {
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

  /**
   * **The case above is the document being valid; this is the refusal.**
   *
   * *THEN the description is refused as invalid, AND the refusal names the
   * schema and the keyword rather than reporting only that a client could not
   * be built.* A lint that passes on today's document says the gate is there
   * and says nothing about what it does to a bad one -- so the bad one is made
   * here rather than waited for.
   */
  it('refuses a schema spelled in a dialect the declared version has no word for', async () => {
    const config = await createConfig({ extends: ['minimal'], rules: RULES })
    const broken = structuredClone(harness.document) as {
      components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> }
    }

    const schemas = broken.components?.schemas ?? {}
    const [named] = Object.keys(schemas)
    expect(named, 'the document publishes no named schema to break').toBeDefined()

    const properties = schemas[named!]?.properties ?? {}
    const [field] = Object.keys(properties)
    expect(field, `${String(named)} publishes no property to break`).toBeDefined()

    // The copy before the keyword goes in, so what is refused below is the
    // keyword rather than anything the clone did on the way.
    const clean = await lintFromString({ source: JSON.stringify(broken), config })
    expect(
      clean.filter((one) => one.severity === 'error'),
      'the copy was already refused before anything was done to it',
    ).toEqual([])

    properties[field!] = { type: 'string', nullable: true }

    const found = await lintFromString({ source: JSON.stringify(broken), config })
    const said = found
      .filter((one) => one.severity === 'error')
      .map((one) => `${one.location[0]?.pointer ?? '?'} ${one.message}`)

    expect(
      said,
      'a schema written in a dialect this document does not declare was accepted, so the ' +
        'gate passes anything a generator would later refuse',
    ).not.toEqual([])
    expect(
      said.join('\n'),
      'the refusal does not name the schema it is about, so a caller is told the document is ' +
        'invalid and not where',
    ).toContain(String(named))
    expect(
      said.join('\n'),
      'the refusal does not name the keyword, so somebody reading it has to diff the document ' +
        'to find out what moved',
    ).toContain('nullable')
  })
})
