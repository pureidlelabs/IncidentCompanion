/**
 * The three places that have to agree about what "a seeded install" is.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

const SEED_ENTRY = read('../src/seed.ts')
const HARNESS = read('./app-harness.ts')
const DEV_LAUNCHER = read('../../dev-node.sh')

/** What a seeded install has, and the method that puts each one there. */
const SEEDERS = [
  { what: 'the built-in library', call: 'seedBuiltIns(' },
  { what: 'the language pack', call: 'seedBuiltIn(' },
  { what: 'the demo cases', call: 'reseed(' },
  { what: 'the demo reports', call: 'fileDeclared(' },
]

describe('what a seeded install is', () => {
  it('is written down once, in the one-shot', () => {
    for (const { what, call } of SEEDERS) {
      expect(
        SEED_ENTRY.includes(call),
        `src/seed.ts never seeds ${what} \u2014 a fresh install would come up without it`,
      ).toBe(true)
    }
  })

  it('is what the harness boots, so a test is not proving a different install', () => {
    // The harness splits them: product data on every boot, demo content on
    // request. Both halves have to exist somewhere in the file, or a test tier
    // is asserting against a shape no deployment produces.
    for (const { what, call } of SEEDERS) {
      expect(
        HARNESS.includes(call),
        `the test harness can never seed ${what}, so no test covers an install that has it`,
      ).toBe(true)
    }
  })

  it('is what the dev loop gets, against a database it wipes every start', () => {
    /**
     * **`compose.dev.yaml` mounts Postgres on a tmpfs**, so the dev database is
     * empty on every start and whatever does not seed it is simply missing.
     */
    expect(
      DEV_LAUNCHER.includes('seed.js'),
      'dev-node.sh never runs the seeder, so the dev loop and the browser tier ' +
        'come up with an empty library and no demo cases',
    ).toBe(true)
  })
})
