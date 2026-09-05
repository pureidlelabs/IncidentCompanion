/**
 * A table column that renders a `view` draws its value on one line, and cuts
 * it with an ellipsis where the column is too narrow.
 *
 * **No other tier can see this.** jsdom gives every element a zero box, so a
 * value on two lines and a value on one are the same reading, and a digest
 * overflowing its column by 329px is indistinguishable from one that fits.
 *
 * The defect it holds: `TextCell` gives a `view` `min-w-0` and withholds
 * `truncate`, on the stated ground that a view knows what it is clipping and
 * bare text does not -- so a `view` rendering bare text has to say so, and
 * four of them did not. Measured at 900px: the malware hash ran 443px through
 * a 114px box and over the verdict beside it, while `special category data`
 * and `triage collection` wrapped to two lines and took their rows from 33px
 * to 46px.
 *
 * **A rect is not the measurement here.** A block-level span's
 * `getBoundingClientRect` is its containing block's width whatever the text
 * inside it does, so comparing that against the cell passes in both states --
 * it did, on all four stories, while the defect was present. What answers is
 * a `Range` over the leaf's own text -- counted by distinct rect tops, since
 * `text-overflow: ellipsis` splits the run where it inserts the mark.
 *
 * **A badge escapes by a different route, and is asserted separately below.**
 * `Badge` is `w-fit`, so it sized to its content and was never constrained --
 * which this file recorded as out of scope until a `Kind` chip was found
 * 24.5px outside its cell and 12.5px into the column beside it. The fix is a
 * cap rather than a clip, so the reading is the box against its cell rather
 * than a `Range` over a text leaf.
 *
 * ```bash
 * cd ui && npm run storybook          # in another shell, first
 * cd server && npx playwright test --config=e2e/visual/playwright.storybook.config.ts \
 *   e2e/visual/a-view-clips-its-own-text.storybook.spec.ts
 * ```
 */
import { expect, test, type Page } from '@playwright/test'

import { STORYBOOK_URL } from './storybook-url.js'

const SB = STORYBOOK_URL

/**
 * The four columns that render a `view`, each in the story that draws it
 * narrowest. `floor` is whether this fixture holds a value the column cannot
 * fit: without one the check passes over nothing, which is the shape of a
 * green suite certifying an empty set.
 */
const COLUMNS: readonly { story: string; column: string; floor: boolean }[] = [
  // The hash column belongs to malware alone, and no story opens on it.
  {
    story: 'blocks-table-entity-scope-table--scoped&args=scope:malware',
    column: 'Hash',
    floor: true,
  },
  { story: 'screens-collect-impact--narrow', column: 'Category', floor: true },
  { story: 'screens-collect-evidence--narrow', column: 'Type', floor: true },
  // No served `taskType` in this fixture is wider than 92px, so this one is a
  // guard against a longer option arriving rather than a live reading.
  { story: 'screens-case-actions--narrow', column: 'Task type', floor: false },
]

interface Drawn {
  text: string
  lines: number
  textWidth: number
  room: number
  ellipsis: string
}

async function storybookIsUp(): Promise<boolean> {
  try {
    const answer = await fetch(`${SB}/index.json`, { signal: AbortSignal.timeout(5_000) })
    return answer.ok
  } catch {
    return false
  }
}

async function openStory(page: Page, id: string): Promise<void> {
  await page.goto(`${SB}/iframe.html?id=${id}&viewMode=story`, {
    waitUntil: 'load',
    timeout: 20_000,
  })
  await page.locator('#storybook-root').waitFor({ state: 'attached', timeout: 30_000 })
  await page.locator('[role="gridcell"]').first().waitFor({ timeout: 30_000 })
}

/** How every row draws that column: lines rendered, text width, room to draw in. */
async function drawnIn(page: Page, column: string): Promise<Drawn[]> {
  return page.evaluate((column) => {
    const heads = [...document.querySelectorAll('[role="columnheader"]')].map(
      (h) => h.textContent?.trim() ?? '',
    )
    const at = heads.findIndex((h) => h.toLowerCase() === column.toLowerCase())
    if (at < 0) throw new Error(`no ${column} column: the heads are ${heads.join(', ')}`)

    const out: Drawn[] = []
    for (const row of [...document.querySelectorAll('[role="row"]')].slice(1)) {
      const cell = row.querySelectorAll('[role="gridcell"], [role="rowheader"]')[at]
      if (!cell) continue
      // The innermost span: `TextCell`'s own wrapper is the column's width by
      // construction and says nothing about the text inside it.
      const leaf = [...cell.querySelectorAll('span, p')].find((n) => !n.querySelector('*'))
      if (!leaf?.textContent?.trim()) continue

      const range = document.createRange()
      range.selectNodeContents(leaf)
      const rects = [...range.getClientRects()]
      const cellStyle = getComputedStyle(cell)
      out.push({
        text: leaf.textContent.trim().slice(0, 30),
        // Distinct tops, not the rect count: `text-overflow: ellipsis` splits
        // the run where it inserts the mark, so a clipped one-liner returns
        // two rects at the same y and a rect count reads it as wrapped.
        lines: new Set(rects.map((r) => Math.round(r.top))).size,
        textWidth: Math.round(Math.max(0, ...rects.map((r) => r.width))),
        room: Math.round(
          cell.getBoundingClientRect().width -
            parseFloat(cellStyle.paddingLeft) -
            parseFloat(cellStyle.paddingRight),
        ),
        ellipsis: getComputedStyle(leaf).textOverflow,
      })
    }
    return out
  }, column)
}

test.describe('a view clips its own text', () => {
  // Narrow on purpose: the widths are percentages of the table, so a wider
  // viewport scales the overrun rather than curing it.
  test.use({ viewport: { width: 900, height: 900 } })

  test.beforeEach(async () => {
    test.skip(!(await storybookIsUp()), `no Storybook at ${SB} - run \`cd ui && npm run storybook\``)
  })

  for (const { story, column, floor } of COLUMNS) {
    test(`${column} is drawn on one line, and cut when it does not fit`, async ({ page }) => {
      await openStory(page, story)
      const rows = await drawnIn(page, column)

      expect(rows.length, `no row draws a ${column}`).toBeGreaterThan(0)

      const tight = rows.filter((r) => r.lines > 1 || r.textWidth > r.room)
      if (floor) {
        expect(
          tight.length,
          `no ${column} in this fixture is wider than its column, so this story cannot see the defect`,
        ).toBeGreaterThan(0)
      }

      expect(
        rows
          .filter((r) => r.lines > 1)
          .map((r) => `"${r.text}" wrapped onto ${String(r.lines)} lines in ${String(r.room)}px`),
        'a view column wrapped instead of clipping, which grows the row',
      ).toEqual([])

      expect(
        tight
          .filter((r) => r.ellipsis !== 'ellipsis')
          .map(
            (r) =>
              `"${r.text}" needs ${String(r.textWidth)}px of ${String(r.room)}px and is cut with nothing to say so`,
          ),
        'a value too long for its column has to say it was cut',
      ).toEqual([])
    })
  }

  /** The whole digest stays recoverable from the cell that cut it. */
  test('the malware hash offers the digest it truncated', async ({ page }) => {
    await openStory(page, 'blocks-table-entity-scope-table--scoped&args=scope:malware')

    const whole = await page.evaluate(() => {
      for (const leaf of document.querySelectorAll('[role="gridcell"] span')) {
        if (leaf.querySelector('*')) continue
        if (!/^[0-9a-f]{16,}$/i.test(leaf.textContent?.trim() ?? '')) continue
        return leaf.closest('[title]')?.getAttribute('title')?.length ?? 0
      }
      return -1
    })

    expect(whole, 'no hash is rendered in this story at all').not.toBe(-1)
    expect(whole, 'the whole digest is not recoverable from the cell').toBeGreaterThanOrEqual(64)
  })
})

/**
 * A badge is capped by the cell that holds it, so its own clip can fire.
 *
 * **The reading is the box, not the text.** A clipped text leaf is found with a
 * `Range`; a badge that has escaped is a box whose right edge is outside its
 * cell's content edge, and the text inside it is laid out correctly the whole
 * time. Measuring the leaf passes in both states.
 *
 * **`want` is what makes this more than a tautology.** After the cap, a chip
 * is inside its cell by construction, so a story holding no value too wide for
 * its column certifies nothing -- the same empty-set failure `floor` guards in
 * the columns above.
 */
test.describe('a badge is capped by its cell', () => {
  test.use({ viewport: { width: 900, height: 900 } })

  test.beforeEach(async () => {
    test.skip(!(await storybookIsUp()), `no Storybook at ${SB} - run \`cd ui && npm run storybook\``)
  })

  test('the methods kind chip does not cross its column', async ({ page }) => {
    await openStory(page, 'screens-collect-methods--overlong')

    const chips = await page.evaluate(() => {
      const heads = [...document.querySelectorAll('[role="columnheader"]')].map(
        (h) => h.textContent?.trim().toLowerCase() ?? '',
      )
      const at = heads.indexOf('kind')
      if (at < 0) throw new Error(`no Kind column: the heads are ${heads.join(', ')}`)

      const out: { text: string; past: number; want: number; room: number }[] = []
      for (const row of [...document.querySelectorAll('[role="row"]')].slice(1)) {
        const cell = row.querySelectorAll('[role="gridcell"], [role="rowheader"]')[at]
        if (!cell) continue
        const chip = cell.querySelector('[data-slot="field-tone"], [class*="rounded-sm"]')
        if (!chip?.textContent?.trim()) continue

        const style = getComputedStyle(cell)
        const box = cell.getBoundingClientRect()
        const room =
          box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
        // **Measured on the text leaf, not on the chip.** Once the chip is
        // capped it clips inside itself, so its own `scrollWidth` equals its
        // `clientWidth` and reports that it wanted exactly the room it got.
        const leaf = [...chip.querySelectorAll('span')].find((n) => !n.querySelector('*')) ?? chip
        const chipStyle = getComputedStyle(chip)
        const padding =
          parseFloat(chipStyle.paddingLeft) + parseFloat(chipStyle.paddingRight)
        out.push({
          text: chip.textContent.trim().slice(0, 30),
          past: Math.round(chip.getBoundingClientRect().right - (box.right - parseFloat(style.paddingRight))),
          want: Math.round(leaf.scrollWidth + padding),
          room: Math.round(room),
        })
      }
      return out
    })

    expect(chips.length, 'no row in this story draws a Kind chip').toBeGreaterThan(0)

    expect(
      chips.filter((c) => c.want >= c.room).length,
      'no Kind value in this story is as wide as its column, so this cannot see the defect',
    ).toBeGreaterThan(0)

    expect(
      chips
        .filter((c) => c.past > 1)
        .map((c) => `"${c.text}" ends ${String(c.past)}px past its cell, wanting ${String(c.want)}px of ${String(c.room)}px`),
      'a badge left the cell holding it and runs into the column beside it',
    ).toEqual([])
  })
})
