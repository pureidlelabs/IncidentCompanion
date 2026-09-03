/**
 * Lint the published document against Redocly's OpenAPI rules.
 *
 * Driven against the real document rather than a fixture: every rule here is a
 * property of the whole surface, and one operation cannot tell whether its id
 * is unique or whether the version supports the keyword its schema emitted.
 *
 * **Two scenarios, and a case each.** *The generator's dialect moves* asks that
 * a move be caught *before the description is served* and *without a route
 * having been added or changed*: a standing lint over the whole document is
 * that, and the clean case is what fires the day the emitter changes under it.
 * *A schema uses a keyword the declared version has no spelling for* asks
 * something the clean case cannot answer -- what the refusal *says* -- so the
 * second case makes a bad document rather than waiting for one.
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

  /**
   * **The case above is the document being valid; this is the refusal.**
   *
   * *THEN the description is refused as invalid, AND the refusal names the
   * schema and the keyword rather than reporting only that a client could not
   * be built.* A lint that passes on today's document says the gate is there
   * and says nothing about what it does to a bad one -- so the bad one is made
   * here rather than waited for.
   *
   * **`nullable` is the keyword, and it is not invented for this.** The
   * document declares 3.1.0, which has no such property, and `openapi.ts`
   * carries a pass that rewrites it out of the one schema Terminus writes by
   * hand. Injecting it is putting back exactly what that pass exists to
   * remove.
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
