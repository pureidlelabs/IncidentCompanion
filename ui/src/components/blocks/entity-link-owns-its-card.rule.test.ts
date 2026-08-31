import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * `EntityLink` carries its own hover card, so nothing wraps it in a second one.
 *
 * A ratchet over the source rather than over the DOM, and **the DOM cannot
 * decide this one.** `ReferenceCell` once wrapped `EntityLink` in an
 * `EntityHoverCard`; re-planting that leaves every rendered test green, because
 * the outer trigger clones its props onto the `EntityLink` *component*, which
 * accepts three props and drops the rest. The second card therefore has no
 * trigger in the document and never opens - measured in jsdom, where hovering
 * the name yields exactly one `[data-slot="entity-card"]` either way.
 *
 * So the second card is dead weight rather than a visible fault: a `HoverCard`
 * root and a scope read per reference cell of every row, wired to nothing. What
 * a reader sees is two cards in the source and one on screen, which is the
 * shape that gets "fixed" by making the outer one work.
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
