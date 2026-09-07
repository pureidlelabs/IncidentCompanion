/**
 * The report screen, on a case that actually has reports.
 *
 * **Everything this walks landed today without a browser seeing it**: seven
 * layouts where the list held only Blank, eighteen seeded reports with ninety
 * one sections of prose, and a language picker that had one option and now
 * derives its list from the packs.
 *
 * **It finds a demo case through the API rather than the picker.** The browser
 * tier's own fixture case is created empty, so its report pane is the empty
 * state, which says nothing about any of the above. Clicking a row in the
 * picker is the other option and depends on how a case row is labelled, which
 * is a second thing to be wrong about.
 */
import { expect, test, type Page } from '@playwright/test'

import { ADMIN, settle, signIn } from './support/app.js'

const shot = 'test-results/report'

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

/**
 * The editors a report's sections are written in.
 *
 * **By the list that holds them, because `Body of ...` labels nothing.**
 * `report-workspace.tsx` gives each section's `TextArea` its own heading as an
 * `aria-label`, so there is no shared prefix to match; what is stable is the
 * `Report sections` list around them.
 *
 * **Still a `textbox`**, which is the discrimination the old selector was
 * making and worth keeping: the loading placeholder carries the same
 * accessible name while being a `status`, so a role-blind locator passes on
 * the skeleton.
 */
function sectionBody(page: Page) {
  return page.locator('[aria-label="Report sections"]').getByRole('textbox')
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

    // **The name says it draws its sections, so it asserts rather than
    // photographs them.** A capture passes whatever the screen shows, including
    // an error state, so a shot is evidence of nothing until somebody opens the
    // file -- which is what `playwright/expect-expect` refuses.
    //
    // **The settled editor, not a heading and not the skeleton.** A heading is
    // visible on an error page too, and the loading placeholder shares the
    // editor's accessible name while being a `status` rather than a `textbox`
    // -- so this is the one selector that means a section actually mounted.
    await expect(sectionBody(page).first()).toBeVisible()

    await page.screenshot({ path: `${shot}-open.png`, fullPage: true })
  })

  /**
   * **A sent report reads; it does not edit.** A heading over an empty body is
   * the failure here, and no tier below can see it: jsdom has no socket, so a
   * section that opened its document and one that never did both render
   * nothing. The text is the server's answer to a handshake, which makes this
   * the only tier that can hold the claim: the prose can be held by the frozen
   * document and by the CRDT and still never reach the screen, because what
   * draws it is a handshake a read-only section has to be allowed to make.
   */
  test('draws the text of a report that was already sent when it was opened', async ({
    page,
    request,
  }) => {
    const caseId = await demoCase(request, 'DEMO-2026-001')
    await signIn(page)
    await page.goto(`/cases/${caseId}/report`, { waitUntil: 'domcontentloaded' })
    await settle(page)

    /**
     * **The rail row, because a report has no address of its own.**
     * `ReportContainer` passes no `openId` and `report-section.tsx` keeps
     * the open report in `useState`, so `?report=` names nothing and the
     * rows are `onSelect` buttons rather than anchors. What they do
     * publish is `rail-report-<id>`, and a frozen one carries a `Sent`
     * qualifier -- which is what the text filter here reads.
     */
    const sent = page
      .locator('[data-testid="rail"] [data-testid^="rail-report-"]')
      .filter({ hasText: /SENT/i })
      .first()
    await expect(sent, 'no sent report in the rail of a demo that ships one').toBeVisible()
    await sent.click()
    await settle(page)

    const body = sectionBody(page).first()
    await expect(body).toBeVisible()
    // **Read-only rather than absent.** A sent report is superseded, not
    // edited, so the body is there and refuses the keyboard.
    // **`readOnly`, because the body is a `TextArea` and not a
    // contenteditable.** `report-workspace.tsx` renders each section with
    // `isReadOnly={!editable}`, so React Aria writes `readonly` on the
    // textarea and `contenteditable` is absent -- the assertion read `""`
    // against `"false"`. The claim is unchanged: a sent report refuses the
    // keyboard.
    await expect(body).toHaveJSProperty('readOnly', true)

    await expect
      .poll(async () => ((await body.textContent()) ?? '').trim().length, {
        message: 'the sent report drew its heading over an empty body',
        timeout: 10_000,
      })
      .toBeGreaterThan(40)
  })
})
