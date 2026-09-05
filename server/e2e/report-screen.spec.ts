/**
 * The report screen, on a case that actually has reports.
 *
 * **It finds a demo case through the API rather than the picker.** The browser
 * tier's own fixture case is created empty, so its report pane is the empty
 * state, which says nothing about any of the above. Clicking a row in the
 * picker is the other option and depends on how a case row is labelled, which
 * is a second thing to be wrong about.
 */
import { expect, test } from '@playwright/test'

import { ADMIN, settle, signIn } from './support/app.js'

const shot = 'test-results/report'

/** The id of a seeded demo case, by the reference the catalogue gives it. */
async function demoCase(request: import('@playwright/test').APIRequestContext, reference: string) {
  const signedIn = await request.post('/api/auth/sign-in/email', {
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  expect(signedIn.ok(), 'the browser tier could not sign in to read the case list').toBe(true)

  const listed = await request.get('/api/cases')
  const rows = (await listed.json()) as { id: string; reference?: string | null }[]
  const found = rows.find((row) => row.reference === reference)
  expect(found, `no demo case with reference ${reference} is seeded`).toBeDefined()
  return found!.id
}

test.describe('the report screen of a seeded case', () => {
  test('lists the reports the demo ships with', async ({ page, request }) => {
    const caseId = await demoCase(request, 'DEMO-2026-031')
    await signIn(page)
    await page.goto(`/cases/${caseId}/report`, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await page.screenshot({ path: `${shot}-list.png` })

    const body = await page.locator('main').innerText()
    expect(body, 'a demo case shows the empty state').not.toContain('has no reports')
  })

  test('opens one and draws its sections', async ({ page, request }) => {
    const caseId = await demoCase(request, 'DEMO-2026-031')
    await signIn(page)
    await page.goto(`/cases/${caseId}/report`, { waitUntil: 'domcontentloaded' })
    await settle(page)

    const first = page.getByText(/Customer RCA/i).first()
    await first.click()
    await settle(page)

    // **The name says it draws its sections, and until 2026-08-17 it only
    // photographed them.** `playwright/expect-expect` found it: a capture
    // passes whatever the screen shows, including an error state, so the shot
    // was evidence of nothing until somebody opened the file.
    //
    // **The settled editor, not a heading and not the skeleton.** A heading is
    // visible on an error page too, and the loading placeholder shares the
    // editor's accessible name while being a `status` rather than a `textbox`
    // -- so this is the one selector that means a section actually mounted.
    await expect(page.locator('[role="textbox"][aria-label^="Body of"]').first()).toBeVisible()

    await page.screenshot({ path: `${shot}-open.png`, fullPage: true })
  })

  test('draws the text of a report that was already sent when it was opened', async ({
    page,
    request,
  }) => {
    const caseId = await demoCase(request, 'DEMO-2026-001')
    await signIn(page)
    await page.goto(`/cases/${caseId}/report`, { waitUntil: 'domcontentloaded' })
    await settle(page)

    // The rail marks a sent report with a SENT chip; this takes the first.
    const sent = page
      .locator('[data-testid="case-rail"] a[href*="report?report="]')
      .filter({ hasText: /SENT/i })
      .first()
    await expect(sent, 'no sent report in the rail of a demo that ships one').toBeVisible()
    await sent.click()
    await settle(page)

    const body = page.locator('[role="textbox"][aria-label^="Body of"]').first()
    await expect(body).toBeVisible()
    // **Read-only rather than absent.** A sent report is superseded, not
    // edited, so the body is there and refuses the keyboard.
    await expect(body).toHaveAttribute('contenteditable', 'false')

    await expect
      .poll(async () => ((await body.textContent()) ?? '').trim().length, {
        message: 'the sent report drew its heading over an empty body',
        timeout: 10_000,
      })
      .toBeGreaterThan(40)
  })
})
