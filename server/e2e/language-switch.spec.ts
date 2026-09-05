/**
 * Switching a report's language, on a page nobody else is touching.
 */
import { expect, test } from '@playwright/test'

import {
  asAdminApi,
  ensureCase,
  fixtureCaseId,
  requireServedApp,
  settle,
  signIn,
} from './support/app.js'

/**
 * **This worker's own case, made before the spec needs it.**
 */
test.beforeEach(async ({ browser, baseURL }) => {
  await requireServedApp(baseURL ?? '')
  await ensureCase(browser, baseURL ?? '')
})

test('switching the language does not raise a merge review', async ({ page, baseURL }) => {
  const api = await asAdminApi(baseURL ?? '')
  let reportId = ''
  try {
    const caseId = await fixtureCaseId(api)
    // **`language: 'en'` is the precondition, not an assumption.** The control
    // has to start somewhere for "switched it" to mean anything, and a report
    // created without one renders as "Default language".
    const made = await api.post(`/api/cases/${caseId}/reports`, {
      data: { label: 'Language switch fixture', language: 'en' },
    })
    expect(made.ok(), `creating the report answered ${String(made.status())}`).toBeTruthy()
    reportId = ((await made.json()) as { id: string }).id

    await signIn(page)
    await page.goto(`/cases/${caseId}/report?report=${reportId}`, {
      waitUntil: 'domcontentloaded',
    })
    await settle(page)

    const picker = page.getByRole('combobox').filter({ hasText: /English|Nederlands/ }).first()
    // Asserted before it is pressed, so a report that arrived without a
    // language fails saying so rather than timing out on the click below.
    await expect(picker, 'the report did not open with a language set').toContainText(/English/)

    await picker.click()
    await settle(page)
    await page.getByRole('option', { name: /Nederlands/ }).click()
    await settle(page)

    await page.screenshot({ path: 'test-results/language-switch.png', fullPage: true })

    // The dialog is the app telling an analyst their write lost a race. On a
    // page no one else has open, there was no race.
    const review = page.getByText(/Someone else changed this too/i)
    // **Read once, not retried.** `toHaveCount(0)` waits for the review to go
    // away, which passes if it appeared and then closed -- the opposite of
    // what this asserts. The claim is that it never appeared at all.
    // eslint-disable-next-line playwright/prefer-to-have-count
    expect(await review.count(), 'a merge review appeared with nobody to merge with').toBe(0)

    // And the control has to end up showing what was chosen.
    await expect(picker).toContainText(/Nederlands/)
  } finally {
    /**
     * **Removed, so a second run is the same run.** Leaving it behind is how
     * the shared demo report accumulated the state this spec used to trip on.
     */
    if (reportId) {
      const caseId = await fixtureCaseId(api)
      const row = (await (
        await api.get(`/api/cases/${caseId}/reports/${reportId}`)
      ).json()) as { version: number }
      const removed = await api.delete(
        `/api/cases/${caseId}/reports/${reportId}?version=${String(row.version)}`,
      )
      expect(removed.ok(), `cleanup answered ${String(removed.status())}`).toBeTruthy()
    }
    await api.dispose()
  }
})
