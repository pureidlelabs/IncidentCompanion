/**
 * **A schema factory has one home, and every other file imports it.**
 *
 * **Read off the source, because the two shapes are identical once parsed.** An
 * inline `z.uuid().nullable().default(null)` and `ref()` build the same schema,
 * so nothing at runtime can tell a copy from the factory.
 *
 * Each home is asserted to still spell its factory, so moving a declaration out
 * leaves this red rather than green over a search that covers nothing.
 *
 * **What this does not cover:** a copy in a file outside the two directories
 * walked here. -> #640
 */
import { readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCHEMA = join(HERE, '..', 'db', 'schema')

const FACTORIES = [
  {
    what: 'a nullable reference',
    spelling: /z\.uuid\(\)\.nullable\(\)\.default\(null\)/,
    home: join(HERE, 'field-spec.ts'),
    among: join(HERE, 'entities'),
  },
  {
    what: 'a list of references',
    spelling: /z\.array\(z\.uuid\(\)\)\.default\(\[\]\)/,
    home: join(HERE, 'field-spec.ts'),
    among: join(HERE, 'entities'),
  },
  {
    what: 'a Postgres bytea column',
    spelling: /customType</,
    home: join(SCHEMA, 'columns.ts'),
    among: SCHEMA,
  },
]

const sources = (dir: string) =>
  readdirSync(dir).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))

describe('a schema factory', () => {
  for (const { what, spelling, home, among } of FACTORIES) {
    it(`declares ${what} in ${basename(home)} and nowhere else`, () => {
      expect(
        spelling.test(readFileSync(home, 'utf8')),
        `${basename(home)} no longer spells it, so the search below covers nothing`,
      ).toBe(true)

      const elsewhere = sources(among)
        .filter((name) => join(among, name) !== home)
        .filter((name) => spelling.test(readFileSync(join(among, name), 'utf8')))
        .sort()

      expect(
        elsewhere,
        `import the factory from ${basename(home)} rather than spelling it out again`,
      ).toEqual([])
    })
  }
})
