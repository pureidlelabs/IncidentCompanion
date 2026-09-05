/**
 * The report index's columns, measured rather than looked at.
 *
 * **A full-viewport screenshot hides this and jsdom cannot see it at all**:
 * every box is zero in the unit tier, so a column that squeezes its neighbour
 * passes `ReportIndex.test.tsx` unchanged. What was reported by eye -- the
 * outstanding line running into Updated -- is a claim about geometry, and the
 * only instrument that settles it is `getBoundingClientRect`.
 *
 * **The property is not "nothing is ever cut".** A line naming empty sections
 * has no upper length, so a column wide enough for every case does not exist.
 * It is that a cut *says so*: `text-overflow: ellipsis`, on a box that can
 * apply it. `truncate` on an inline `<span>` cannot, which is what shipped --
 * the sentence ended mid-word with nothing to show there had been more.
 */
import { expect, test } from '@playwright/test'

import { ADMIN, settle, signIn } from './support/app.js'

interface Cell {
  text: string
  width: number
  scroll: number
  ellipsis: string
  right: number
}

test.describe('the report index', () => {
  test('cuts no cell without an ellipsis, and fits the viewport', async ({ page, request }) => {
    const signedIn = await request.post('/api/auth/sign-in/email', {
      data: { email: ADMIN.email, password: ADMIN.password },
    })
    expect(signedIn.ok(), 'the browser tier could not sign in').toBe(true)
    const rows = (await (await request.get('/api/cases')).json()) as
      { id: string; reference?: string | null }[]
    const found = rows.find((row) => row.reference === 'DEMO-2026-031')
    expect(found, 'DEMO-2026-031 is not seeded').toBeDefined()

    await signIn(page)
    await page.goto(`/cases/${found!.id}/report`, { waitUntil: 'domcontentloaded' })
    await settle(page)

    const seen = await page.evaluate(() => {
      const table = document.querySelector('table')
      if (!table) return null
      const read = (nodes: Element[]) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect()
          // The ellipsis may be declared on the cell or on the one box inside
          // it that carries the text, so take whichever says it.
          const inner = node.querySelector('*')
          // **The declaration is not the effect, and asserting the
          // declaration is inert.** `text-overflow: ellipsis` is computed on an
          // inline box exactly as on a block one and does nothing there, so a
          // cut column passes. An ellipsis renders only where the box is not
          // inline and clips its own overflow.
          const shows = (n: Element | null) => {
            if (!n) return false
            const s = getComputedStyle(n)
            return s.textOverflow === 'ellipsis'
              && s.display !== 'inline'
              && (s.overflowX === 'hidden' || s.overflowX === 'clip')
          }
          return {
            text: (node.textContent ?? '').trim().slice(0, 60),
            width: Math.round(box.width),
            scroll: Math.max(node.scrollWidth, inner?.scrollWidth ?? 0),
            ellipsis: shows(node) || shows(inner) ? 'yes' : 'no',
            right: Math.round(box.right),
          }
        })
      return {
        headers: read([...table.querySelectorAll('thead th')]),
        cells: read([...table.querySelectorAll('tbody td')]),
        docWidth: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      }
    })
    expect(seen, 'no table on the report screen').not.toBeNull()

    // A header is a fixed word: one that does not fit is a column too narrow
    // for its own name, which no ellipsis excuses.
    const cutHeader = seen!.headers.find((cell: Cell) => cell.scroll > cell.width + 1)
    expect(cutHeader, `the header "${cutHeader?.text ?? ''}" does not fit its column`)
      .toBeUndefined()

    const silent = seen!.cells.filter(
      (cell: Cell) => cell.scroll > cell.width + 1 && cell.ellipsis === 'no',
    )
    expect(silent.map((cell: Cell) => cell.text), 'cut with nothing to show it').toEqual([])

    expect(seen!.docWidth).toBeLessThanOrEqual(seen!.viewport)
  })
})
