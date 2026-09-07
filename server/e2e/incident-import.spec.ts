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
import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  asAdminApi,
  ensureCase,
  openFirstCase,
  requireServedApp,
  section,
  settle,
  signIn,
} from './support/app.js'

/**
 * Tick a box the way a person does: on the visual, not on the input.
 *
 * The kit's checkbox is a visually hidden `input` inside its own
 * `checkbox-box`, and that box **intercepts a click aimed at the input** --
 * Playwright resolves the role to the input, aims at it, and is refused by the
 * element drawn over it. Clicking the label is what a browser turns into a
 * change on the input anyway.
 */
async function tick(box: Locator): Promise<void> {
  await box.waitFor({ state: 'attached', timeout: 15_000 })
  await box.locator('xpath=ancestor::label[1]').click()
}

async function reachReview(page: Page, incident = /Import incident/): Promise<void> {
  await page.getByRole('button', { name: 'Sign in' }).click()
  // **The workspace is a Select, already holding the first one the listing
  // answered.** Clicking the trigger opens its listbox rather than advancing,
  // which left every case in this file waiting on the incidents phase from the
  // workspace one.
  await expect(page.getByRole('button', { name: /aurora-soc/ })).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()
  await tick(page.getByRole('checkbox', { name: incident }).first())
  await page.getByRole('button', { name: 'Fetch detail' }).click()
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

    // **Named, not the first row.** The listing is newest first and the window
    // dial decides what is in it, so which incident leads is not this test's to
    // assume -- and only this one carries the asset asserted below.
    await reachReview(page, /Import incident SEN-1002/)
    await page.getByRole('button', { name: /^Import \d+ row/ }).click()

    // **Filtered, because three live regions are on screen at once**: the
    // review's summary, the primary's pending spinner, and this line. Asking
    // for the role alone is a strict-mode violation rather than a wait.
    await expect(
      page.getByRole('status').filter({ hasText: /Imported\. \d+ row/ }),
    ).toBeVisible({ timeout: 20_000 })

    // **Asserted on the screen the analyst reads, not only on the toast.** A
    // write that half-lands and a client that paints optimistically look the
    // same in a status line.
    // **`entities`, because assets is a fragment on it** -- the rail links
    // `entities#assets`, so a section helper matching a path segment finds no
    // row for `assets` at all.
    await section(page, 'entities')
    await expect(
      page.getByRole('row').filter({ hasText: 'WKS-0142' }).first(),
    ).toBeVisible({ timeout: 20_000 })
  })

  test('the door at the start creates the case and lands on it', async ({ page }) => {
    await signIn(page)
    await page.goto(`/cases?importer=demo`)
    await settle(page)

    /**
     * **The picker's panes are state, not routes**, so `Start a case` has no
     * address of its own and the rail's row is the only way to it. By its
     * test id, because the rail row and the pane's own heading are both
     * called `New case` and the role query is then ambiguous.
     */
    await page.getByTestId('picker-row-new').click()
    await page.getByRole('button', { name: 'Import incidents' }).click()

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
   * can see them disagree.** The panel holds the selection and the wizard
   * holds the approved set it reports up; a unit test drives a stubbed preview
   * where both are built from the same fixture, so the two agree there whether
   * or not they agree in a browser.
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
    // **`ensureCase` answers the title, which is what the screen helpers take.**
    // The collection route takes an id, and a title in that segment is a 400
    // whose body then fails the length matcher rather than the assertion.
    const title = await ensureCase(browser, baseURL ?? '')
    const api = await asAdminApi(baseURL ?? '')
    const listed = (await (await api.get('/api/cases')).json()) as { id: string; title: string }[]
    const caseId = listed.find((one) => one.title === title)?.id
    expect(caseId, `no case is called ${title}`).toBeDefined()
    const before = await (await api.get(`/api/cases/${String(caseId)}/systems`)).json()

    await signIn(page)
    await openFirstCase(page)
    await section(page, 'import-sentinel')
    await page.goto(`${page.url()}?importer=demo`)
    await settle(page)
    await reachReview(page)

    const after = await (await api.get(`/api/cases/${String(caseId)}/systems`)).json()
    expect((after as unknown[])).toHaveLength((before as unknown[]).length)
  })
})
