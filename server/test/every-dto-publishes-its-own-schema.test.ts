/**
 * Every DTO the server declares reaches the published document under a name of
 * its own.
 *
 * `@nestjs/swagger` keys `components.schemas` by the DTO class's own name, and
 * nothing in this tree passes `@ApiSchema({ name })` to say otherwise. So two
 * classes sharing a name share one entry: whichever registers second wins, and
 * the route that lost is documented with the other's fields. A client generated
 * from the reference is then wrong about a body nobody changed. -> #649
 *
 * **Counted rather than compared field by field.** What goes wrong is a name
 * collision, and a count is exactly what a collision moves -- two classes, one
 * schema. Reading each schema's shape instead would pass the day two disjoint
 * DTOs happened to be named alike and checked out individually.
 *
 * **Both declaration forms, because the second is where the sharpest instance
 * was.** `createZodDto` returns a class called `AugmentedZodDto`, so
 * `const X = createZodDto(...)` -- the form a discriminated union is forced
 * into, since a class cannot extend one -- infers no name and every such DTO
 * registers under that one key. Reading only `class X extends` leaves them
 * invisible to exactly the check they need.
 *
 * **What this does not cover:** whether a published schema is *correct* for its
 * route, which is `openapi-document.test.ts`'s lint and the route's own tests;
 * and a collision between a DTO and a schema registered by some other route,
 * which this count cannot see because it only knows what `createZodDto`
 * declares.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, type Harness } from './app-harness.js'

const runnable = await bootable()
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

/**
 * The DTOs that reach the document as *parameters* rather than as a schema.
 *
 * A DTO bound to `@Query()` is published one parameter per key, on each
 * operation that takes it, and `components.schemas` gets no entry -- so the
 * count below cannot see them and would read the library working as a DTO
 * documented nowhere.
 *
 * **Each is published, and asserted where that can be read**: the routes' own
 * parameters are checked in `a-required-parameter-is-required.test.ts`, which
 * leaves each one out and reads the answer.
 */
const AS_PARAMETERS: ReadonlySet<string> = new Set([
  'ActivityQueryDto',
  'ExportQueryDto',
  'ImportQueryDto',
  'IndicatorQueryDto',
  'LangQueryDto',
])

/** Every `class X extends createZodDto(...)` the server declares, by name. */
function declared(): { name: string; where: string }[] {
  const found: { name: string; where: string }[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') walk(full)
      } else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
        for (const line of readFileSync(full, 'utf8').split('\n')) {
          const hit =
            /class (\w+Dto) extends createZodDto/.exec(line) ??
            /(?:const|let|var) (\w+Dto) = createZodDto/.exec(line)
          if (hit?.[1]) found.push({ name: hit[1], where: relative(SRC, full) })
        }
      }
    }
  }
  walk(SRC)
  return found
}

describe.skipIf(!runnable)('the DTOs the server declares', () => {
  let harness: Harness

  beforeAll(async () => {
    harness = await boot()
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('finds classes to check', () => {
    // Without this the two cases below pass over an empty list, which is what a
    // moved directory or a changed declaration idiom looks like from here.
    expect(declared().length).toBeGreaterThan(85)
  })

  /**
   * **The collision, named where it is declared.** The count alone says a name
   * is shared; a reader needs the two files to decide which door each belongs
   * to.
   */
  it('gives each of them a name no other DTO class uses', () => {
    const seen = new Map<string, string[]>()
    for (const one of declared()) {
      seen.set(one.name, [...(seen.get(one.name) ?? []), one.where])
    }
    const shared = [...seen.entries()]
      .filter(([, where]) => where.length > 1)
      .map(([name, where]) => `${name}: ${where.sort().join(', ')}`)
      .sort()

    expect(
      shared,
      'two DTO classes share a name, so they share one entry in the published document and ' +
        'the route that registered first is described by the other',
    ).toEqual([])
  })

  /**
   * **Matched on the prefix, because the key is not the class name.**
   * `nestjs-zod` publishes a serialised DTO as `<ClassName>_Output`, built from
   * the class's own name. Matching the whole key would fail on every DTO in the
   * tree and prove nothing.
   */
  it('publishes a schema for every one of them', () => {
    const schemas = Object.keys(
      (harness.document as { components?: { schemas?: Record<string, unknown> } }).components
        ?.schemas ?? {},
    )
    const missing = [...new Set(declared().map((one) => one.name))]
      .filter((name) => !AS_PARAMETERS.has(name))
      .filter((name) => !schemas.some((key) => key === name || key.startsWith(`${name}_`)))
      .sort()

    expect(
      missing,
      'a DTO class declares a schema the document publishes under no key of its own',
    ).toEqual([])
  })

  /**
   * **A name set aside is a name something still declares.** A DTO renamed or
   * deleted leaves an entry here excusing nothing, and the next query DTO to be
   * documented nowhere is excused by a list nobody re-read.
   */
  it('sets aside no DTO that is gone', () => {
    const names = new Set(declared().map((one) => one.name))
    expect([...AS_PARAMETERS].filter((name) => !names.has(name)).sort()).toEqual([])
  })

  /**
   * **The reverse, which is the direction the collision hides in.** A DTO whose
   * class has no name of its own still publishes -- under whatever name the
   * library gave the class it built. The count above cannot see that, because
   * the declaration it is looking for is the one that does not exist.
   */
  it('publishes no schema that no DTO accounts for', () => {
    const names = new Set(declared().map((one) => one.name))
    const schemas = Object.keys(
      (harness.document as { components?: { schemas?: Record<string, unknown> } }).components
        ?.schemas ?? {},
    )
    const orphans = schemas
      .filter((key) => ![...names].some((name) => key === name || key.startsWith(`${name}_`)))
      .sort()

    expect(
      orphans,
      'the document publishes a schema under a name nothing declares, which is what a DTO ' +
        'built by a call rather than a declaration registers as',
    ).toEqual([])
  })
})
