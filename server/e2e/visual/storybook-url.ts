import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

/**
 * Where Storybook answers for *this* worktree.
 *
 * **Derived, never written down.** `stack.mjs` allocates a slot from the
 * worktree's absolute path, so a literal is correct in one tree and points at
 * a neighbour's in the next. Here it was worse than wrong: every spec that
 * probes Storybook skips when nothing answers, so a literal that missed made
 * the whole tier report success having run nothing.
 *
 * `__dirname` rather than `import.meta`: Playwright loads these through a
 * CommonJS wrapper whatever the extension says.
 */
export const STORYBOOK_URL: string =
  process.env['STORYBOOK_URL'] ??
  `http://127.0.0.1:${String(
    (
      JSON.parse(
        execFileSync('node', [join(__dirname, '../../scripts/stack.mjs'), '--json'], {
          encoding: 'utf8',
        }),
      ) as { storybookPort: number }
    ).storybookPort,
  )}`
