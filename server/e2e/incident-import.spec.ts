/**
 * **Both doors an incident comes through, pressed in a browser.**
 *
 * The wizard's four phases, the review panel and the write are three tiers
 * agreeing: the client posts a payload it does not read, the server maps and
 * judges it, and the rows come back on a screen. The unit tiers each hold one
 * of those and cannot see the seams -- a client test drives a stubbed preview,
 * a server test posts a payload no wizard built.
 *
 * **`?importer=demo` is what makes this reachable.** The live source needs an
 * interactive Entra sign-in, so a browser run cannot get past the connect
 * phase; the demo source answers from data in the bundle and makes no request.
 * It is not a bypass -- every row still goes through the same import routes
 * under the analyst's own session. -> `ui/src/api/sentinel/demoSource.ts`
 */
import { expect, test, type Page } from '@playwright/test'

import {
  asAdminApi,
  ensureCase,
  openFirstCase,
  requireServedApp,
  section,
  settle,
  signIn,
} from './support/app.js'

async function reachReview(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: /aurora-soc/ }).first().click()
  await page.getByRole('checkbox', { name: /Import incident/ }).first().click()
  await page.getByRole('button', { name: 'Continue' }).click()
  // The review panel is the server's answer, so this is also the assertion that
  // the preview round trip happened at all.
  // **Anchored on the count, because the picker rail carries an Import archive
  // row.** A substring match on the word reaches both and Playwright refuses
  // the ambiguity - which is the right refusal, and the reason the pattern
  // starts at the line and ends in a row count.
  await expect(page.getByRole('button', { name: /^(Import|Create and import) \d+ row/ })).toBeVisible({
    timeout: 20_000,
  })
}

test.describe('importing a Sentinel incident', () => {
  test.beforeEach(async ({ baseURL }) => {
    await requireServedApp(baseURL ?? '')
  })

  test('the door inside a case writes rows the case then shows', async ({ page, browser, baseURL }) => {
    await ensureCase(browser, baseURL ?? '')
    await signIn(page)
    await openFirstCase(page)
    await section(page, 'import-sentinel')

      await page.goto(`${page.url()}?importer=demo`)
    await settle(page)

    await reachReview(page)
    await page.getByRole('button', { name: /^Import \d+ row/ }).click()

    await expect(page.getByRole('status')).toContainText(/Imported \d+ row/, { timeout: 20_000 })

    // **Asserted on the screen the analyst reads, not only on the toast.** A
    // write that half-lands and a client that paints optimistically look the
    // same in a status line.
    await section(page, 'assets')
    await expect(page.getByRole('table')).toContainText('WKS-0142', { timeout: 20_000 })
  })

  test('the door at the start creates the case and lands on it', async ({ page }) => {
    await signIn(page)
    await page.goto(`/cases?importer=demo`)
    await settle(page)

    await page.getByRole('button', { name: /New case/ }).click()
    await page.getByRole('button', { name: /live source|Sentinel/i }).first().click()

    await reachReview(page)

    const title = `Started from an incident ${String(Date.now())}`
    await page.getByLabel('Title').fill(title)
    await page.getByRole('button', { name: /^Create and import/ }).click()

    await page.waitForURL(/\/cases\/[0-9a-f-]{36}/, { timeout: 20_000 })
    await settle(page)
    await expect(page.getByText(title)).toBeVisible()
  })

  /**
   * **The count and the ticks are one answer, and this is the only tier that
   * can see them disagree.** The panel holds selection in one table per kind
   * and the wizard holds the approved set; a unit test drives a stubbed
   * preview where both are built from the same fixture, so the two agree there
   * whether or not they agree in a browser.
   */
  test('says it will create exactly the rows that are ticked', async ({ page, browser, baseURL }) => {
    await ensureCase(browser, baseURL ?? '')
    await signIn(page)
    await openFirstCase(page)
    await section(page, 'import-sentinel')

    // What the server actually answered, read off the wire rather than
    // inferred from the screen: when this disagrees with the count, the
    // failure says which half is wrong.
    let seen = 'no preview seen'
    page.on('response', (reply) => {
      if (!reply.url().includes('/imports/preview')) return
      void reply
        .json()
        .then((body: { entities?: unknown[]; timeline?: unknown[] }) => {
          seen = `entities=${String(body.entities?.length)} timeline=${String(body.timeline?.length)}`
        })
        .catch(() => undefined)
    })

    await page.goto(`${page.url()}?importer=demo`)
    await settle(page)
    await reachReview(page)

    const ticked = await page.getByRole('checkbox', { checked: true }).count()
    const header = await page
      .getByRole('columnheader')
      .getByRole('checkbox', { checked: true })
      .count()
    const rows = ticked - header

    const said = await page
      .getByRole('button', { name: /^(Import|Create and import) \d+ row/ })
      .innerText()
    expect(said, `${String(rows)} rows are ticked, preview said ${seen}`).toContain(
      `${String(rows)} row(s)`,
    )
  })

  test('a preview leaves the case untouched', async ({ page, browser, baseURL }) => {
    const caseId = await ensureCase(browser, baseURL ?? '')
    const api = await asAdminApi(baseURL ?? '')
    const before = await (await api.get(`/api/cases/${caseId}/systems`)).json()

    await signIn(page)
    await openFirstCase(page)
    await section(page, 'import-sentinel')
    await page.goto(`${page.url()}?importer=demo`)
    await settle(page)
    await reachReview(page)

    const after = await (await api.get(`/api/cases/${caseId}/systems`)).json()
    expect((after as unknown[])).toHaveLength((before as unknown[]).length)
  })
})
