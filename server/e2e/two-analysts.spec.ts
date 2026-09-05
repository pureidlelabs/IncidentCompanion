/**
 * **Two analysts in one case, which is the product's whole premise.**
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

  // The helper these waited on exists now: `openFirstCase` opens the tier's own
  // case by the link in its title cell, and every section sweep drives it.
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
   * **A caret with a name on it.**
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
   * **The repaint, from the other side of the wire.**
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
      // The other analyst is on the same screen, so the repaint is visible
      // there rather than needing a navigation to find it.
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
 */
async function openDemoNotes(page: Page, known?: string): Promise<string> {
  const caseId = known ?? await demoCaseId(page)
  await page.goto(`/cases/${caseId}/notes`, { waitUntil: 'domcontentloaded' })
  await settle(page)
  return caseId
}

/** The demo case this installation ships, by the flag the API sets on it. */
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
 */
async function noteBody(page: Page) {
  const body = page.getByRole('textbox', { name: 'Note' }).first()
  await body.waitFor({ state: 'visible', timeout: 20_000 })
  return body
}

/** Everyone the roster is currently showing. */
function presence(page: Page) {
  return page.locator('[data-testid="presence-stack"] [data-testid="presence-person"]')
}

/**
 * Writes a case field through the screen, not through the API.
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
