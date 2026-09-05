import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * **The container declares the corner and the table clips to it.**
 *
 * A rounded box whose children each round themselves never lines up: the arcs
 * differ by the border's width, the innermost wins at the extremes, and an
 * opaque header band paints a notch outside the curve. One clip on the table
 * replaces every child rounding itself.
 *
 * **`clip-path` on the table rather than `overflow` on the container**, because
 * an overflow there makes the container the scrollport its own sticky header
 * sticks to, and that box never scrolls vertically. The table sits inside the
 * border, so the container still draws its own.
 *
 * Both halves are asserted because either alone is silent: a clip against a
 * corner nothing declares rounds to nothing, and a corner nothing clips to is
 * a token no box reads. jsdom resolves no radius, so what the unit tier can
 * hold is the pairing rather than the pixels -- `paints-past-the-corner` in
 * `server/e2e/visual/probe.js` is what measures the result.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const table = readFileSync(resolve(HERE, 'table.tsx'), 'utf8')
const dataTable = readFileSync(
  resolve(HERE, '..', 'blocks', 'data-table.tsx'),
  'utf8',
)

describe('a table keeps its corner', () => {
  it('clips the table to the corner its container declared', () => {
    expect(
      table,
      'the table no longer clips to `--table-corner`, so every box on the ' +
        'container`s edge is back to rounding itself and the arcs will not line up',
    ).toContain('[clip-path:inset(0_round_var(--table-corner))]')
  })

  it('declares that corner on the kit container', () => {
    expect(
      table,
      'the bordered variant no longer names `--table-corner`, so the clip above ' +
        'rounds to nothing',
    ).toMatch(/bordered:[\s\S]{0,200}--table-corner:/)
  })

  it('declares it on the block that draws its own card', () => {
    expect(
      dataTable,
      '`DataTable` hand-rolls its bordered box rather than using the kit ' +
        'container, so it declares the same corner or its tables clip to zero',
    ).toContain('--table-corner:')
  })
})
