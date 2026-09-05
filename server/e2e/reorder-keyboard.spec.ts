import { expect, test, type Page } from '@playwright/test'

import { ADMIN, asAdminApi, asPersona, section, settle } from './support/app.js'

/**
 * **A keyboard drag on the report outline commits.**
 */

/**
 * The order of the outline, read off the grips.
 */
async function gripOrder(page: Page): Promise<string[]> {
  const grips = await page.getByRole('button', { name: /^Reorder / }).all()
  return Promise.all(grips.map(async (one) => (await one.getAttribute('aria-label')) ?? ''))
}

/** Whatever the live regions are saying right now. */
async function announced(page: Page): Promise<string> {
  return (await page.locator('[role="status"], [aria-live]').allInnerTexts()).join(' | ').trim()
}

test('moves a report section with the keyboard, and keeps it', async ({ browser, baseURL }) => {
  const { page } = await asPersona(browser, ADMIN)

  const api = await asAdminApi(baseURL ?? '')
  const cases = (await (await api.get('/api/cases')).json()) as {
    id: string
    isDemo?: boolean
  }[]
  const demo = cases.find((one) => one.isDemo)
  expect(demo, 'no demo case is installed').toBeTruthy()

  /**
   * **A *draft* report, because the section lands on the index and the first row
   * is a sent one.**
   */
  const openDraft = async () => {
    await section(page, 'report')
    await settle(page)
    const draft = page.getByRole('row').filter({ hasText: 'Draft' }).first()
    await draft.waitFor({ state: 'visible', timeout: 15_000 })
    await draft.getByRole('button').first().click()
    await settle(page)
  }

  await page.goto(`/cases/${demo!.id}/timeline`)
  await settle(page)
  await openDraft()

  /**
   * **Relative to whatever order it finds, because this spec writes.**
   */
  const before = await gripOrder(page)
  expect(before.length, 'the outline has too few sections to reorder').toBeGreaterThan(1)

  /**
   * **The row picked up has to be taller than the one below it, or this spec
   * measures nothing.**
   */
  const heights = await Promise.all(
    (await page.getByRole('button', { name: /^Reorder / }).all()).map(async (one) => {
      const row = one.locator('xpath=ancestor::li[1]')
      const box = await row.boundingBox()
      return box?.height ?? 0
    }),
  )
  const taller = heights.findIndex(
    (height, index) => index + 1 < heights.length && height > heights[index + 1]! + 40,
  )
  expect(
    taller,
    `no section is meaningfully taller than the one below it, so the defect this ` +
      `guards cannot occur here - heights were ${JSON.stringify(heights)}`,
  ).toBeGreaterThanOrEqual(0)

  const grip = page.getByRole('button', { name: /^Reorder / }).nth(taller)
  await grip.waitFor({ state: 'visible', timeout: 15_000 })
  const moving = (await grip.getAttribute('aria-label')) ?? ''
  await grip.focus()

  // Space picks up, ArrowDown moves, Space drops - the sensor's own gesture.
  // The live region is read between the steps, because it is what tells a
  // pickup that never happened from a move that did not commit.
  await page.keyboard.press('Space')
  await settle(page)
  const pickup = await announced(page)

  await page.keyboard.press('ArrowDown')
  await settle(page)
  const arrow = await announced(page)

  await page.keyboard.press('Space')
  await settle(page)

  /**
   * **`over` changing is the property, and it is exactly what was broken.**
   */
  expect(arrow, 'the arrow never moved the section over another row').not.toEqual(pickup)

  const after = await gripOrder(page)
  expect(after, 'the keyboard drag moved nothing').not.toEqual(before)
  expect(after.indexOf(moving), 'the section did not move down exactly one place').toBe(
    before.indexOf(moving) + 1,
  )

  /**
   * **Reloaded, because a move that only repaints is the failure this is
   * about.**
   */
  await page.reload()
  await settle(page)
  await openDraft()

  expect(await gripOrder(page), 'the move was not written to the case').toEqual(after)
})
