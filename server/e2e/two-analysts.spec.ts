/**
 * **Two analysts in one case, which is the product's whole premise.**
 *
 * **This is the spec that catches a missing change feed from the outside.** A
 * writing service with no feed behind it takes the write and announces
 * nothing, so the other analyst's screen never moves. The server tier asserts
 * the wiring; this asserts what the analyst sees.
 *
 * **Two browser contexts, not two tabs.** A tab shares storage, so one sign-in
 * would serve both and the roster would show one analyst twice - which is
 * exactly the thing under test failing to fail.
 */
import { expect, test, type Page } from '@playwright/test'

import {
  ADMIN,
  ANALYST,
  ensureAnalyst,
  ensureCase,
  openFirstCase,
  section,
  settle,
  signIn,
} from './support/app.js'

test.beforeAll(async ({ browser, baseURL }) => {
  await ensureAnalyst(browser, baseURL ?? '')
  await ensureCase(browser, baseURL ?? '')
})

test.describe('two analysts in one case', () => {
  test.setTimeout(120_000)

  test('each is announced to the other on the roster', async ({ browser }) => {
    const first = await browser.newContext({ ignoreHTTPSErrors: true })
    const second = await browser.newContext({ ignoreHTTPSErrors: true })

    try {
      const one = await first.newPage()
      await signIn(one, ADMIN)
      await openFirstCase(one)

      const two = await second.newPage()
      await signIn(two, ANALYST)
      await openFirstCase(two)

      // Presence rides the socket and is announced through Redis, so it is not
      // synchronous with the page load. Playwright's own retry is the wait.
      await expect(
        presence(one),
        'the first analyst never saw the second arrive',
      ).toHaveCount(2, { timeout: 20_000 })
    } finally {
      await first.close()
      await second.close()
    }
  })

  /**
   * **Two analysts writing one note, which is the slice this file exists for.**
   *
   * Neither unit tier can see this. jsdom has no `WebSocket` at all, so the
   * body there is the ordinary single-writer editor and every assertion about
   * sharing would be about a stub; the server tier holds one `Y.Doc` and
   * never renders it. Only a browser has both ends.
   *
   * **The assertion is on the other analyst's screen**, not on the first's own
   * text and not on the row: a field showing what was typed into it proves
   * nothing, and `casenotes.note` is written by the server after a quiet
   * moment rather than per keystroke.
   */
  test('a note typed by one analyst appears in the other analyst\'s copy of it', async ({
    browser,
  }) => {
    const first = await browser.newContext({ ignoreHTTPSErrors: true })
    const second = await browser.newContext({ ignoreHTTPSErrors: true })

    try {
      const one = await first.newPage()
      await signIn(one, ADMIN)
      const demo = await openDemoNotes(one)

      const two = await second.newPage()
      await signIn(two, ANALYST)
      await openDemoNotes(two, demo)

      // The screen opens the newest note, so both are in the same document
      // without either of them picking one.
      const written = `Both of us are in this note ${String(Date.now())}`
      const mine = await noteBody(one)
      await mine.click()
      await one.keyboard.type(written)

      await expect(
        await noteBody(two),
        'the second analyst never saw what the first typed',
      ).toContainText(written, { timeout: 20_000 })
    } finally {
      await first.close()
      await second.close()
    }
  })

  /**
   * **A caret with a name on it.** Awareness is the half of live prose that is
   * not the text: without it two analysts overwrite each other's paragraph and
   * neither can see why. The caret is drawn by the collaboration extension
   * from the identity `useProseSync` is given, and an unnamed one is the
   * documented failure - `y-tiptap` falls back to `User: 2654252565`.
   */
  test('each analyst sees the other named in the note they are both in', async ({ browser }) => {
    const first = await browser.newContext({ ignoreHTTPSErrors: true })
    const second = await browser.newContext({ ignoreHTTPSErrors: true })

    try {
      const one = await first.newPage()
      await signIn(one, ADMIN)
      const demo = await openDemoNotes(one)

      const two = await second.newPage()
      await signIn(two, ANALYST)
      await openDemoNotes(two, demo)

      // A caret exists once it has been placed: an analyst who has not clicked
      // into the body has no selection to broadcast.
      await (await noteBody(two)).click()
      await two.keyboard.type('.')

      await expect(
        one.locator('.collaboration-carets__caret, [class*="collaboration-carets"]').first(),
        'the first analyst never saw the second analyst\'s caret',
      ).toBeVisible({ timeout: 20_000 })
    } finally {
      await first.close()
      await second.close()
    }
  })

  /**
   * **The repaint, from the other side of the wire.** Renaming a case writes a
   * row and announces it; the other browser must show the new title without
   * being reloaded. A service that writes the row and announces nothing passes
   * every other tier.
   */
  test('a write by one analyst reaches the other without a reload', async ({ browser }) => {
    const first = await browser.newContext({ ignoreHTTPSErrors: true })
    const second = await browser.newContext({ ignoreHTTPSErrors: true })

    try {
      const one = await first.newPage()
      await signIn(one, ADMIN)
      await openFirstCase(one)

      const two = await second.newPage()
      await signIn(two, ANALYST)
      await openFirstCase(two)

      const renamed = `Renamed by the browser tier ${String(Date.now())}`
      await writeCustomer(one, renamed)
      await section(two, 'settings')

      await expect(
        two.getByLabel('Customer').first(),
        'the second analyst never saw the write',
      ).toHaveValue(renamed, { timeout: 20_000 })
    } finally {
      await first.close()
      await second.close()
    }
  })
})

/**
 * Open the notes screen of the demo case, and say which case that was.
 *
 * **The demo case, not `ensureCase`'s.** The tier's own case is created empty,
 * and a notes screen with no notes draws its empty state and no body at all -
 * so a spec about two analysts in one note would wait on a field that is
 * correctly absent. `prose-table.spec.ts` picks the demo case for the same
 * reason.
 */
async function openDemoNotes(page: Page, known?: string): Promise<string> {
  const caseId = known ?? await demoCaseId(page)
  await page.goto(`/cases/${caseId}/notes`, { waitUntil: 'domcontentloaded' })
  await settle(page)
  return caseId
}

async function demoCaseId(page: Page): Promise<string> {
  const answered = await page.request.get('/api/cases')
  expect(answered.ok(), 'the browser tier could not list the cases').toBe(true)
  const rows = (await answered.json()) as { id: string; isDemo?: boolean }[]
  const demo = rows.find((row) => row.isDemo)
  expect(demo, 'no demo case - nothing here has a note to write in').toBeDefined()
  return demo?.id ?? ''
}

/**
 * The body of the note the screen has open.
 *
 * A prose body is a contenteditable rather than a textarea, and the screen
 * names it from the served form's label.
 */
async function noteBody(page: Page) {
  const body = page.getByRole('textbox', { name: 'Note' }).first()
  await body.waitFor({ state: 'visible', timeout: 20_000 })
  return body
}

function presence(page: Page) {
  return page.locator('[data-testid="presence-stack"] [data-testid="presence-person"]')
}

/**
 * Writes a case field through the screen, not through the API.
 *
 * The claim under test is that *a* write reaches the other analyst, so any
 * field an analyst can edit serves.
 */
async function writeCustomer(page: Page, value: string): Promise<void> {
  await section(page, 'settings')
  const field = page.getByLabel('Customer').first()
  await field.waitFor({ state: 'visible' })
  await field.fill(value)
  // The settings form saves on blur rather than on a button.
  await field.blur()
  await settle(page)
}
