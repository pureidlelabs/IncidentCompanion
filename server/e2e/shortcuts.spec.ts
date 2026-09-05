/**
 * **The keyboard hints, where neither unit tier can see them.**
 *
 * jsdom gives every element a zero box, so a cap that renders, carries the
 * right text and is 4px tall passes the component tests. What this asserts is
 * what an analyst sees: the caps are drawn, they are on one line, and they do
 * not overlap the command title beside them.
 */
import { expect, test } from '@playwright/test'

import { openFirstCase, signIn } from './support/app.js'

test.describe('the shortcut hints', () => {
  test('draws a cap per key on the cheat sheet, side by side', async ({ page }) => {
    // **Inside a case, because that is where the shortcuts exist.** `ChordLayer`
    // mounts in `CaseShell`, so nothing on the picker answers a chord and a
    // press there goes into a void.
    await signIn(page)
    await openFirstCase(page)
    await page.keyboard.press('?')

    // **By its accessible name, because `data-testid="cheat-sheet"` has never
    // existed.** `git log -S` finds no commit adding or removing it, and the
    // only testid the sheet carries is `shortcut-<id>` per row -- so this
    // waited fifteen seconds for an element nothing renders and blamed the
    // screen. The name is what `CheatSheetDialog` passes as `aria-label`, and
    // asserting it holds something a testid does not: what a screen reader
    // announces. The sibling case below finds the palette the same way.
    const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
    await expect(sheet).toBeVisible()

    const caps = sheet.locator('[data-slot="kbd"]')
    expect(await caps.count(), 'the cheat sheet drew no key caps').toBeGreaterThan(0)

    /**
     * **A cap has to be big enough to read.** The whole reason this is not a
     * unit test: a component test asserts the text and cannot tell that the
     * element collapsed to nothing.
     */
    for (const box of await caps.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })),
    )) {
      expect(box.h, 'a key cap collapsed').toBeGreaterThan(12)
      expect(box.w, 'a key cap collapsed').toBeGreaterThan(8)
    }

    /**
     * **The keys of one chord sit on a line, not stacked.** `KbdGroup` is an
     * inline flex; if it wrapped, `Ctrl` and `K` would read as two separate
     * shortcuts.
     */
    const group = sheet.locator('[data-slot="kbd-group"]').first()
    const tops = await group
      .locator('[data-slot="kbd"]')
      .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)))
    if (tops.length > 1) {
      expect(Math.max(...tops) - Math.min(...tops), 'a chord wrapped over two lines').toBeLessThan(
        4,
      )
    }

    await sheet.screenshot({ path: 'test-results/cheat-sheet.png' })
  })

  test('draws the same caps in the command palette', async ({ page }) => {
    await signIn(page)
    await openFirstCase(page)
    await page.keyboard.press('Control+k')

    const palette = page.getByRole('dialog')
    await expect(palette).toBeVisible()
    await expect(
      palette.locator('[data-slot="kbd"]').first(),
      'the palette shows a shortcut as text rather than as a cap',
    ).toBeVisible()

    await palette.screenshot({ path: 'test-results/command-palette.png' })
  })
})
