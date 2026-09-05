import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

/**
 * Where Storybook answers for *this* worktree.
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
