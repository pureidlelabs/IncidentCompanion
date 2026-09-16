/**
 * Nothing else compares the two: `build:demo` regenerates the catalogue, while
 * the suite, Storybook and dev all read the copy in the tree. -> #672
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { writeApiCatalogue } from './api-catalogue.js'

const CHECKED_IN = join(dirname(fileURLToPath(import.meta.url)), '../../../ui/src/demo/catalogue')

describe('the demo catalogue checked in beside the client', () => {
  it('is byte for byte what the controllers answer', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'demo-catalogue-'))
    const written = [...writeApiCatalogue(fresh)].sort()
    expect(
      readdirSync(CHECKED_IN).sort(),
      'the catalogue holds a file the capture does not write, or is missing one',
    ).toEqual(written)

    const differs = written.filter(
      (file) =>
        readFileSync(join(fresh, file)).compare(readFileSync(join(CHECKED_IN, file))) !== 0,
    )
    expect(
      differs.join(', '),
      'behind the controllers; regenerate with `npm run demo:catalogue` from ui/',
    ).toBe('')
    rmSync(fresh, { recursive: true })
  })
})
