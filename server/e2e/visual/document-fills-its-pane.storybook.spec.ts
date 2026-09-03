/**
 * A document surface uses the room the pane gives it.
 *
 * `--document-viewport-h` is `100vh` less the chrome above the document, and
 * that subtrahend is a constant standing in for two elements whose heights it
 * cannot see. When either changes, the document is left short and the gap is
 * dead space under the page an analyst is reading -- which is what the token's
 * own comment records happening once already, at 289px.
 *
 * **jsdom cannot check a constant against a layout.** Every element there has
 * a zero box, so the only tier that can compare the two is a browser at a real
 * height. What is asserted is the relationship rather than either number: the
 * document's bottom edge sits at the pane's bottom edge, whatever the chrome
 * above it happens to measure.
 *
 * ```bash
 * cd ui && npm run storybook          # in another shell, first
 * cd server && npx playwright test --config=e2e/visual/playwright.storybook.config.ts \
 *   e2e/visual/document-fills-its-pane.storybook.spec.ts
 * ```
 */
import { expect, test, type Page } from '@playwright/test'

const SB = process.env['STORYBOOK_URL'] ?? 'http://localhost:6006'

/** A report open in the workspace, which is where the paper column is drawn. */
const STORY = 'screens-report-section--opened-on-a-report'

/** Whether a Storybook is listening, asked once. */
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
  // **Long enough for a loaded machine.** Ten seconds passes this story in
  // 1.3s on its own and timed out at 11.0s inside a full sweep, where a dozen
  // browsers and the dev server are competing -- a check that fails on how
  // busy the host is reports nothing about the layout.
  await page.locator('#storybook-root').waitFor({ state: 'attached', timeout: 30_000 })
  await page.locator('[data-slot="pane-scroll"]').waitFor({ timeout: 30_000 })
}

test.describe('a document uses the room its pane gives it', () => {
  // The config sets no viewport, and a height claim needs a real one.
  test.use({ viewport: { width: 1400, height: 900 } })

  test.beforeEach(async () => {
    test.skip(!(await storybookIsUp()), `no Storybook at ${SB} - run \`cd ui && npm run storybook\``)
  })

  test('ends where the pane ends, rather than short of it', async ({ page }) => {
    await openStory(page, STORY)

    // Paper is not the default view, so the switch is pressed rather than
    // assumed: a run that measured the composing view would find no document
    // at all and pass by measuring nothing.
    await page.getByRole('radio', { name: /page|paper|document/i }).first().click()

    const measured = await page.evaluate(() => {
      const paper = [...document.querySelectorAll('div')].find((el) =>
        String(el.className).includes('document-viewport-h'),
      )
      const pane = document.querySelector('[data-slot="pane-scroll"]')
      if (!(paper instanceof HTMLElement) || !(pane instanceof HTMLElement)) {
        throw new Error('the workspace drew no document surface, or the shell drew no pane')
      }
      const p = paper.getBoundingClientRect()
      const box = pane.getBoundingClientRect()
      return {
        chromeAbove: Math.round(p.top - box.top),
        shortBy: Math.round(box.bottom - p.bottom),
        paperHeight: Math.round(p.height),
      }
    })

    // A document of no height would satisfy any statement about its bottom
    // edge only by accident; this says one was drawn.
    expect(measured.paperHeight, 'the document surface has no height').toBeGreaterThan(200)

    expect(
      measured.shortBy,
      `the document stops ${String(measured.shortBy)}px above the pane's bottom edge -- dead space under the page, because the constant subtracts more than the ${String(measured.chromeAbove)}px of chrome actually above it`,
    ).toBeLessThanOrEqual(2)
  })
})
