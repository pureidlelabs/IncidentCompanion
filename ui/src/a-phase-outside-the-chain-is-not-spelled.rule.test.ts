import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

import { ukcCycle } from '@contract/killchain'
import { UKC_PHASE } from '@contract/vocabularies.lists'

/**
 * **Which served member is not a kill chain phase is the server's answer, and
 * the client asks for it** - `ukcCycle` gives that member no cycle.
 *
 * A client spelling the name instead reads correct until the member is renamed
 * or a second one is added, at which point the coverage table grows a row and
 * no test fails.
 *
 * The refused names are taken from the server rather than written here, so this
 * rule follows a rename instead of becoming the next copy of one.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)))

/** Prose may name what the code may not spell - the rule's own docstrings do. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

describe('no client file spells the member with no cycle', () => {
  const outside = UKC_PHASE.filter((phase) => ukcCycle(phase) === '')

  it('finds a member to refuse', () => {
    expect(outside.length).toBeGreaterThan(0)
  })

  /**
   * A story builds the entries a screen is drawn from and a fixture is the
   * served document itself, so both spell vocabulary values as data.
   */
  const files = globSync('**/*.{ts,tsx}', { cwd: SRC, absolute: true })
    .map((path) => path.split('\\').join('/'))
    .filter((path) => !/\.(test|stories)\.tsx?$/.test(path))
    .filter((path) => !path.includes('/fixtures/') && !path.includes('/demo/catalogue/'))

  it('finds the tree to read', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('asks for it instead', () => {
    const wrong: string[] = []
    for (const file of files) {
      const text = withoutComments(readFileSync(file, 'utf8'))
      for (const phase of outside) {
        if (text.includes(phase)) wrong.push(`${relative(SRC, file)} spells ${phase}`)
      }
    }
    expect(
      wrong.sort(),
      'the chain has no stage for this member and the server says so by giving it ' +
        'no cycle. Read `ukcCycle` through `@contract/killchain` rather than the name.',
    ).toEqual([])
  })
})
