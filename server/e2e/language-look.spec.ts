/**
 * What switching a report to Dutch actually does to the screen.
 */
import { expect, test } from '@playwright/test'

import { ADMIN, settle, signIn } from './support/app.js'

const shot = 'test-results/language'

async function demoCase(request: import('@playwright/test').APIRequestContext, reference: string) {
  const signedIn = await request.post('/api/auth/sign-in/email', {
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  expect(signedIn.ok(), 'the browser tier could not sign in').toBe(true)
  const rows = (await (await request.get('/api/cases')).json()) as
    { id: string; reference?: string | null }[]
  const found = rows.find((row) => row.reference === reference)
  expect(found, `no demo case with reference ${reference}`).toBeDefined()
  return found!.id
}

test('capture a report in English and then in Dutch', async ({ page, request }) => {
  const caseId = await demoCase(request, 'DEMO-2026-031')
  await signIn(page)
  await page.goto(`/cases/${caseId}/report`, { waitUntil: 'domcontentloaded' })
  await settle(page)

  await page.getByText(/Customer RCA/i).first().click()
  await settle(page)

  // **The switch below is a write, and it survives the run.** Without this the
  // "English" shot is English exactly once -- every later run opens the report
  // this one left in Dutch and captures two Dutch screens under two names.
  const control = () =>
    page.getByRole('combobox').filter({ hasText: /English|Nederlands/ }).first()
  if (await control().count()) {
    await control().click()
    await settle(page)
    await page.getByRole('option', { name: /English/ }).click()
    await settle(page)
  }
  await page.screenshot({ path: `${shot}-1-english.png`, fullPage: true })

  // The language control itself: what an analyst is offered, and what the
  // screen says about how complete each option is.
  const picker = page.getByRole('combobox').filter({ hasText: /English|Nederlands/ }).first()
  if (await picker.count()) {
    await picker.click()
    await settle(page)
    await page.screenshot({ path: `${shot}-2-picker.png` })
    await page.getByRole('option', { name: /Nederlands/ }).click()
    await settle(page)
  }
  await page.screenshot({ path: `${shot}-3-dutch.png`, fullPage: true })

  // And the document as it would leave: the export is the one renderer that is
  // right by construction, so it is what the analyst is really choosing.
  await page.goto(`/api/cases/${caseId}/reports?lang=nl`, { waitUntil: 'domcontentloaded' })
})
