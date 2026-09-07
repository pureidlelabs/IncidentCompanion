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
  fixtureCaseId,
  openFirstCase,
  requireServedApp,
  section,
  settle,
  signIn,
} from './support/app.js'

async function reachReview(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign in' }).click()

  /**
   * **The workspace is a Select, so pressing it opens a listbox rather than
   * choosing.** This pressed the trigger and went straight on, leaving the
   * listbox open over the step: `Continue` then timed out being clicked
   * through the popover, and every later phase was unreachable. Choosing the
   * option is what advances it.
   */
  await page.getByRole('button', { name: /aurora-soc/ }).first().click()
  await page.getByRole('option', { name: /aurora-soc/ }).first().click()
  await page.getByRole('button', { name: 'Continue' }).click()

  /**
   * **Any time, because the fixture's incidents are dated and the default is a
   * window.** `NO_DIALS` opens on `Last 7 days` and `fixtureSource.ts` carries
   * fixed dates, so the listing empties the moment those are a week old --
   * *0 of 0 incident(s)* on a step whose next control needs a ticked row. The
   * dates are the fixture's own business; what this asks for is every incident
   * it has, whenever they were.
   */
  // By its label, not its text: a Select's accessible name is the value it is
  // showing, so matching the window would pin the test to today's default.
  await page.getByLabel('Opened').click()
  await page.getByRole('option', { name: 'Any time' }).click()
  await page.getByRole('button', { name: /^Search/ }).click()

  /**
   * **The label, because the checkbox itself is visually hidden.** The kit's
   * `CheckboxButton` renders a `<label>` around a `VisuallyHidden` input, so
   * `getByRole('checkbox')` resolves an element with no box and the click
   * waits fifteen seconds for it to become visible. The label is what a person
   * presses and what carries the row.
   */
  await page.locator('label:has([aria-label^="Import incident"])').first().click()
  // **`Fetch detail`, not `Continue`.** The incidents phase names its forward
  // control after what pressing it does -- it goes back to the provider for the
  // alerts and entities behind the ticked rows -- so the wizard's four steps do
  // not share one button name.
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

    await reachReview(page)
    await page.getByRole('button', { name: /^Import \d+ row/ }).click()

    /**
     * **Counted, not read, because the step leaves a status region of its own.**
     * The incidents phase keeps a live *"n of m incident(s)"* line, so once the
     * toast arrives `getByRole('status')` matches two and Playwright refuses
     * the ambiguity. Asking for exactly one region that says it is the same
     * assertion without the guess about which is which.
     */
    await expect(
      page.getByRole('status').filter({ hasText: /Imported\b.*\b\d+ row/ }),
      'no status region said the rows were imported',
    ).toHaveCount(1, { timeout: 20_000 })

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

    // **Scoped to `main`, because the picker rail carries a New case row too**
    // and Playwright refuses the ambiguity -- the same refusal, for the same
    // reason, as the Import archive row in `reachReview` above.
    await page.locator('main').getByRole('button', { name: /New case/ }).click()
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
    await ensureCase(browser, baseURL ?? '')
    const api = await asAdminApi(baseURL ?? '')
    /**
     * **`fixtureCaseId`, because `ensureCase` answers the title.** This called
     * its result `caseId` and put it straight in the path, so the read was
     * `/api/cases/Browser tier case 0/systems` and the server answered
     * *"Browser tier case 0 is not a case id."* -- a 400 body that
     * `toHaveLength` then reported as a type error. Nothing caught it because
     * the wizard never reached this line.
     */
    const caseId = await fixtureCaseId(api)
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
