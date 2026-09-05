import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * `EntityLink` carries its own hover card, so nothing wraps it in a second one.
 */
const HERE = dirname(fileURLToPath(import.meta.url))

/** Import statements only: both names also appear in prose in this directory. */
function importedNames(source: string): Set<string> {
  const names = new Set<string>()
  for (const match of source.matchAll(/^import\s+([^;]*?)\s+from\s+['"][^'"]+['"]/gms)) {
    for (const name of match[1]!.split(/[\s,{}]+/)) if (name) names.add(name)
  }
  return names
}

describe('the reference cell wraps no second hover card', () => {
  const files = readdirSync(HERE).filter((name) => name.endsWith('.tsx'))

  it('finds the modules to check', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('gives no module both the link and the card to compose', () => {
    const doubled = files
      .filter((name) => {
        const names = importedNames(readFileSync(join(HERE, name), 'utf8'))
        return names.has('EntityLink') && names.has('EntityHoverCard')
      })
      .sort()

    expect(
      doubled,
      'these import both, and the only thing to do with both is nest one card in the other',
    ).toEqual([])
  })
})
