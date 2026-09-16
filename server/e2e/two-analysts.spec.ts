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
  demoCase,
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

      try {
        await expect(await noteBody(two)).toContainText(written, { timeout: 20_000 })
      } catch (cause) {
        // The original carries Playwright's received text and call log, and a
        // `noteBody` throw carries its own diagnosis: replacing either with a
        // stage verdict loses the half that says what was actually on screen.
        throw new Error(
          `the second analyst never saw what the first typed, and ${await whereItStopped(one, demo, written)}`,
          { cause },
        )
      }
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
      await openProperties(two)

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

/**
 * The guided demo, by name.
 *
 * **Whichever demo came back first is not a fixture**: the listing has no
 * order a spec may rely on, and the two waits below -- 20s for a note body and
 * 15s for a click on it -- are decided by whether the case it landed on has a
 * note at all. -> #453
 */
async function demoCaseId(page: Page): Promise<string> {
  return demoCase(page.request, 'DEMO-2026-001')
}

/**
 * The body of the note the screen has open.
 *
 * A prose body is a contenteditable rather than a textarea, and the screen
 * names it from the served form's label.
 *
 * **`exact`, so a second textbox named `Notes` cannot silently become
 * `.first()`.** On a timeout it says what the screen held: *not visible* twenty
 * seconds later tells a reader nothing.
 */
async function noteBody(page: Page) {
  const body = page.getByRole('textbox', { name: 'Note', exact: true }).first()
  try {
    await body.waitFor({ state: 'visible', timeout: 20_000 })
  } catch {
    throw new Error(`no note body on ${page.url()} -- ${await whatTheScreenHeld(page)}`)
  }
  return body
}

/**
 * What the notes screen was showing, for a failure that found no body.
 *
 * Every count rather than the first thing that matches: a screen with no
 * textboxes and a screen with one nobody named are different failures, and a
 * message that reported only "not found" makes them the same.
 */
async function whatTheScreenHeld(page: Page): Promise<string> {
  return page.evaluate(() => {
    const named = (el: Element) =>
      el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? ''
    const boxes = [...document.querySelectorAll('[role="textbox"], textarea, input[type="text"]')]
    // The body still arriving is a `role="status"` paragraph rather than a
    // textbox, so it counts as none of them and reads exactly like an empty
    // screen. It is the likelier of the two on a timeout.
    const waiting = document.querySelector('[role="status"][aria-busy="true"]')
    const main = document.querySelector('main')
    return [
      waiting ? 'still loading the body' : 'not loading',
      `textboxes=${String(boxes.length)}`,
      `named=[${boxes.map(named).filter(Boolean).join('|')}]`,
      `main=${main ? String(main.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) : 'absent'}`,
    ].join(' ')
  })
}

/**
 * Which of the three stages a hand-off reached, for a failure that has to say.
 *
 * The update never left the first browser, never reached the server, or never
 * reached the second, and the three have different fixes.
 *
 * **The server is polled rather than read once**, because a note is persisted
 * after a quiet moment rather than per keystroke. A stage is named only on a
 * positive: everything else says what it could not establish.
 */
async function whereItStopped(
  page: Page,
  caseId: string,
  written: string,
  waitMs = 20_000,
): Promise<string> {
  // A read that failed and an editor that is empty are different answers, and
  // only the second says the text never left.
  let mine: string | null
  try {
    mine = await page.getByRole('textbox', { name: 'Note', exact: true }).first().textContent()
  } catch (why) {
    return `the first analyst's own editor could not be read, so no stage is named: ${String(why)}`
  }
  if (!(mine ?? '').includes(written)) {
    return 'it never left the first browser: the text is not in the first analyst\'s own editor'
  }

  const until = Date.now() + waitMs
  let last = 'the case has no note holding it'
  while (Date.now() < until) {
    const answered = await page.request.get(`/api/cases/${caseId}/casenotes`).catch(() => null)
    if (!answered) {
      last = 'the notes route could not be reached from the first browser'
    } else if (!answered.ok()) {
      last = `the notes route answered ${String(answered.status())}`
    } else {
      const body: unknown = await answered.json()
      // A read of the wrong shape finds nothing, which is what a note that
      // never arrived looks like.
      if (!Array.isArray(body)) {
        last = `the notes route answered ${typeof body}, not a list of rows`
      } else if (body.some((row) => String(noteOf(row)).includes(written))) {
        return 'it reached the server and not the second browser: the stored note holds it'
      }
    }
    await page.waitForTimeout(500)
  }
  // The row is written after a quiet moment, so its silence is two states at
  // once and names neither.
  return `it left the first browser, and ${last} after ${String(waitMs)}ms -- so it either never reached the server or reached it and is not yet written down`
}

/** The note text of a row, and '' for a row whose note is not text. */
function noteOf(row: unknown): string {
  if (typeof row !== 'object' || row === null) return ''
  const note = (row as { note?: unknown }).note
  return typeof note === 'string' ? note : ''
}

function presence(page: Page) {
  return page.locator('[data-testid="presence-stack"] [data-testid="presence-person"]')
}

/**
 * Puts the case's editable fields on screen.
 *
 * **`overview`, because `settings` is an alias the rail stopped offering.**
 * `SECTION_ALIASES` in `case-sections.ts` resolves the old address so a
 * bookmark keeps working, and says the rail drops the slug when a section
 * absorbs another's -- so navigating *through the rail* to `settings` asks for
 * a row that is deliberately not there.
 *
 * **And the overview lands on `Read`, where the only editable thing is the
 * command search.** `Title`, `Customer`, `Analyst` and the rest are one tab
 * across, so without this the field is in the DOM and never visible - which
 * reads as the case having no customer to write.
 */
async function openProperties(page: Page): Promise<void> {
  await section(page, 'overview')
  await page.getByRole('tab', { name: 'Properties' }).click()
}

/**
 * Writes a case field through the screen, not through the API.
 *
 * The claim under test is that *a* write reaches the other analyst, so any
 * field an analyst can edit serves.
 */
async function writeCustomer(page: Page, value: string): Promise<void> {
  await openProperties(page)
  const field = page.getByLabel('Customer').first()
  await field.waitFor({ state: 'visible' })
  await field.fill(value)
  // The settings form saves on blur rather than on a button.
  await field.blur()
  await settle(page)
}
