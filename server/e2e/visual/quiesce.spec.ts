/**
 * `quiesce` waits out a skeleton that mounts after the page has read as still, and throws on one that never clears.
 *
 * The page mounts its skeleton just after `settle`'s second reading of `main`, which is the moment a render
 * starved of its main thread commits on a loaded runner.
 */
import { expect, test, type Page } from '@playwright/test'

import { quiesce, VisualError } from './view.js'

const ORIGIN = 'https://quiesce.example.test'

async function skeletonAfterTwoReadings(page: Page, busyMs: number | null): Promise<void> {
  const script = `
    const read = Document.prototype.querySelectorAll
    let readings = 0
    Document.prototype.querySelectorAll = function (selector) {
      if (selector === 'main *' && ++readings === 2) setTimeout(() => {
        const skeleton = document.createElement('div')
        skeleton.setAttribute('aria-busy', 'true')
        skeleton.textContent = 'Loading'
        document.querySelector('main').append(skeleton)
        if (${String(busyMs !== null)}) setTimeout(() => skeleton.remove(), ${String(busyMs ?? 0)})
      }, 0)
      return read.call(this, selector)
    }`
  await page.route(`${ORIGIN}/`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<html><body><main><p>Case</p></main><script>${script}</script></body></html>`,
    }),
  )
  await page.goto(`${ORIGIN}/`)
}

test('waits for a skeleton that mounts after the page has read as still', async ({ page }) => {
  await skeletonAfterTwoReadings(page, 1500)
  await quiesce(page, 10_000)
  // Read once: a retrying assertion would do the waiting quiesce owes.
  // eslint-disable-next-line playwright/prefer-to-have-count
  expect(await page.locator('[aria-busy="true"]').count()).toBe(0)
})

test('throws on a skeleton that never clears', async ({ page }) => {
  await skeletonAfterTwoReadings(page, null)
  await expect(quiesce(page, 3000)).rejects.toThrow(VisualError)
})
