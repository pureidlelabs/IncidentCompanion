import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

/**
 * **A table offering a bulk edit offers a way to tick every row.**
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..', '..')

/** The bar, and the header checkbox that makes it usable. */
const RENDERS_BAR = /<BulkActionBar\b/
/** The call, not the name: `selectionColumn<Row>(...)` or `selectionColumn(`. */
const RENDERS_SELECT_ALL = /\bselectionColumn\s*(?:<[^>]*>\s*)?\(/

/** What a file is once its imports and its prose are off it. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/^import\b[\s\S]*?from\s*['"][^'"]*['"]\s*$/gm, '')
}

describe('a bulk bar comes with a select-all', () => {
  const files = globSync('{screens,components}/**/*.tsx', { cwd: SRC })
    .map((rel) => rel.split('\\').join('/'))
    .filter((rel) => !rel.endsWith('.test.tsx'))
    // The block's own two files define the bar rather than rendering a table.
    .filter(
      (rel) =>
        rel !== 'components/blocks/bulk-actions.tsx' &&
        rel !== 'components/blocks/bulk-actions.tsx',
    )
    // `SelectionSlot` is where a section puts the bar, not a table itself.
    .filter((rel) => rel !== 'components/ui/selection-slot.tsx')
    .map((rel) => ({ path: rel, text: code(readFileSync(join(SRC, rel), 'utf8')) }))

  const callers = files.filter(({ text }) => RENDERS_BAR.test(text))

  it('finds the callers to check', () => {
    // Two screens and two stories at the time of writing. A zero here would
    // make every assertion below pass over nothing.
    expect(callers.length).toBeGreaterThanOrEqual(4)
  })

  it('gives every one of them a header checkbox', () => {
    const without = callers
      .filter(({ text }) => !RENDERS_SELECT_ALL.test(text))
      .map(({ path }) => path)
      .sort()
    expect(
      without,
      'these render a bulk bar with no way to tick every row -- add selectionColumn',
    ).toEqual([])
  })
})
