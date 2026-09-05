/**
 * Switching a report's language, on a page nobody else is touching.
 *
 * **Written to tell a product defect from an artefact of the harness.** A
 * capture showed the merge-review dialog on this interaction, and a single
 * capture cannot say whether the conflict came from the app or from an earlier
 * spec in the same run: one worker, one fresh page, one control pressed.
 *
 * **It owns the report it drives, which is what makes a second run mean
 * anything.** Opening a shared demo report and taking whichever the client
 * lands on is not repeatable. Measured 2026-08-13: a freshly seeded stack holds
 * 18 reports, every one `language = 'en'`; after a tier run the same database
 * holds reports with an empty language, created by the specs themselves. Land
 * on one of those and the control reads "Default language", so a locator
 * filtering on the language names matches nothing and the spec times out on a
 * control that is present and correct. It fails as a click timeout or as a text
 * timeout depending on how far it got, which is why it reads as two different
 * flakes.
 *
 * So the report is created here, in this worker's own case, with the language
 * it starts from stated rather than inherited.
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
 * **This worker's own case, made before the spec needs it.** `fixtureCaseId`
 * asserts the case exists rather than creating one, so a spec that skips this
 * fails saying `ensureCase did not run` - which is what it did when this spec
 * stopped borrowing a demo case and started owning its report.
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

    await expect(picker).toContainText(/Nederlands/)
  } finally {
    /**
     * **Removed, so a second run is the same run.** Left behind, a shared
     * report accumulates the state the paragraph at the head of this file
     * describes.
     *
     * **A delete names the version it read**, and a cleanup that ignores that
     * is refused with 422 and leaves the row - which is exactly the silent
     * accumulation this spec was rewritten to stop, reintroduced by its own
     * teardown. Asserted, so a cleanup that stops working says so.
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
