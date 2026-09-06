import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

/**
 * **A table offering a bulk edit offers a way to tick every row.**
 *
 * Bulk delete and bulk apply act on a selection, and building one row at a
 * time over forty rows is not a selection anybody makes. The header box is
 * `selectionColumn`'s, in `data-table.tsx` -- so the failure this guards
 * is not a missing component but a screen that wired the bar and left the
 * column out, which looks correct until somebody tries to use it.
 *
 * **The affordance audit reported this as absent from the `bulk-actions`
 * block, and it is not.** The block never owned it; the two stories differ.
 * The app's harness renders a `DataTable` with `selectionColumn`, the aria
 * one drew its own list of checkboxes, and the audit compares what the stories
 * paint. What was really missing was anything holding the two together, which
 * is this.
 *
 * Source text rather than the DOM: the claim is about every caller at once,
 * and rendering each one would cover whichever screens somebody remembered.
 *
 * **The imports and the comments come off first**, and that is not tidiness.
 * Matching the whole file lets a screen delete its `selectionColumn(...)` call
 * and satisfy the check on the now-unused *import* -- green while the screen it
 * governs has no header checkbox at all. Prose is stripped for the trap
 * `password-fields.test.ts` records: a file explaining the rule must not pass
 * it by explaining it.
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
