/**
 * **Fill every Add dialog and submit it, which is the half the empty-form
 * sweep cannot reach.**
 */
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'

import {
  ADMIN,
  DIALOG,
  asPersona,
  caseTitle,
  closeDialog,
  complaints,
  dismissToasts,
  ensureCase,
  openAddDialog,
  openFirstCase,
  requireServedApp,
  section,
  sections,
  settle,
  unservedReason,
} from './support/app.js'

/** Recognisable in a case, and inside every `maxLength` the schemas set. */
const MARK = 'e2e-written'

/**
 * **`beforeEach`, not `beforeAll`, because only the former may skip.**
 */
test.beforeEach(async ({ browser, baseURL }) => {
  await requireServedApp(baseURL ?? '')
  await ensureCase(browser, baseURL ?? '')
})

/**
 * **The fixture case is deleted, not tidied row by row.**
 */
test.afterAll(async ({ browser, baseURL }) => {
  // Nothing was written if the tests skipped, and reaching for a server that
  // is not there would fail the run for the reason it was skipped over.
  if ((await unservedReason(baseURL ?? '')) !== null) return
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  try {
    await context.request.post(`${baseURL ?? ''}/api/auth/sign-in/email`, {
      data: { email: ADMIN.email, password: ADMIN.password },
      failOnStatusCode: false,
    })
    const rows = (await (await context.request.get(`${baseURL ?? ''}/api/cases`)).json()) as {
      id: string
      title: string
      isDemo?: boolean
    }[]
    for (const row of rows.filter((entry) => !entry.isDemo && entry.title === caseTitle())) {
      await context.request.delete(`${baseURL ?? ''}/api/cases/${row.id}`, {
        failOnStatusCode: false,
      })
    }
  } finally {
    await context.close()
  }
})

/**
 * Fills one control with something its own kind will accept.
 */
async function fill(control: Locator, mark: string): Promise<string | null> {
  const kind = await control.evaluate((node) => ({
    tag: node.tagName,
    type: (node as HTMLInputElement).type,
    required: (node as HTMLInputElement).required,
    // **The shape, because the platform types are gone.** A UTC timestamp is
    // two text boxes now rather than `type="date"` and `type="time"`: those
    // render in the operating system's locale, which no attribute reaches, so
    // a field labelled UTC drew `mm/dd/yyyy` and a twelve-hour clock. Keying
    // off `type` alone types the mark into them and the form refuses for a
    // reason that has nothing to do with the write path.
    shape: (node as HTMLInputElement).placeholder,
  }))

  if (kind.tag === 'SELECT') return null
  if (kind.type === 'checkbox' || kind.type === 'radio') return null
  if (kind.type === 'file') return null

  /**
   * **A datetime-local field takes its own format and nothing else.**
   */
  const value =
    kind.type === 'datetime-local'
      ? '2026-08-12T09:30'
      : kind.type === 'date' || /YYYY-MM-DD/.test(kind.shape)
        ? '2026-08-12'
        : /HH:MM/.test(kind.shape)
          ? '09:30'
          : kind.type === 'number'
            ? '1'
            : mark

  await control.fill(value).catch(() => undefined)
  return value
}

/** Every control in the open dialog that can hold a value. */
function fields(page: Page): Locator {
  /**
   * **A select's shadow input is `type="text"`, so excluding `hidden` does not
   * exclude it.**
   */
  return page
    .locator(DIALOG)
    .locator(
      'input:not([type="hidden"]):not([id$="-hidden-input"]):not([role="combobox"]), textarea',
    )
}

/**
 * What one section's Add dialog did with a filled form.
 */
type Written =
  | { outcome: 'wrote' }
  | { outcome: 'skipped'; why: string }
  | { outcome: 'refused'; said: string }
  | { outcome: 'undriveable'; note: string }

/**
 * Opens the current section's Add dialog, fills it with `mark`, submits it.
 */
async function writeARow(page: Page, mark: string): Promise<Written> {
  await dismissToasts(page)
  /**
   * **A door that is not there and a door that threw are different findings**,
   * and both used to answer `skipped`.
   */
  const door = await openAddDialog(page).catch((error: Error) => error)
  if (door instanceof Error) {
    return { outcome: 'undriveable', note: `Add threw: ${door.message.split('\n')[0] ?? ''}` }
  }
  if (!door) return { outcome: 'skipped', why: 'no Add door' }

  /**
   * **Every value is read back, and a lost one is retried once.**
   */
  const controls = fields(page)
  const count = await controls.count()
  let filled = 0
  for (let i = 0; i < count; i += 1) {
    const control = fields(page).nth(i)
    if (!(await control.isVisible().catch(() => false))) continue
    if (!(await control.isEditable().catch(() => false))) continue
    const wanted = await fill(control, mark)
    if (wanted === null) continue
    let held = await control.inputValue().catch(() => '')
    if (held !== wanted) {
      await fields(page).nth(i).fill(wanted).catch(() => undefined)
      held = await fields(page).nth(i).inputValue().catch(() => '')
    }
    if (held === wanted) filled += 1
  }

  /**
   * **What the form is actually holding, before it is submitted.**
   */
  const holding = await fields(page).evaluateAll((nodes) =>
    nodes.filter((node) => (node as HTMLInputElement).value !== '').length,
  )

  // A dialog with nothing to type is not this sweep's business.
  if (filled === 0) {
    await closeDialog(page)
    return { outcome: 'skipped', why: `nothing fillable (0 of ${String(count)} controls took a value)` }
  }

  const submit = page
    .locator(DIALOG)
    .getByRole('button', { name: /^(add|save|create|record)\b/i })
    .first()
  const submits = await submit.count()
  if (submits === 0 || (await submit.isDisabled())) {
    /**
     * **Every button the dialog does offer, named.**
     */
    const offered = (
      await page.locator(DIALOG).getByRole('button').allInnerTexts()
    ).map((line) => line.trim().replace(/\s+/g, ' ')).join(' / ')
    await closeDialog(page)
    return {
      outcome: 'skipped',
      why:
        submits === 0
          ? `no submit control; ${String(filled)} filled, buttons offered: ${offered || 'none'}`
          : `submit disabled; ${String(filled)} filled, buttons offered: ${offered || 'none'}`,
    }
  }

  await submit.click().catch(() => undefined)
  await settle(page, 6000)

  /**
   * **The dialog closing is the write landing.**
   */
  const stillOpen = (await page.locator(DIALOG).count()) > 0
  /**
   * **Three outcomes, not two.**
   */
  if (!stillOpen) {
    await dismissToasts(page)
    return { outcome: 'wrote' }
  }

  /**
   * **The complaint, not the dialog.**
   */
  const inDialog = (await page.locator(DIALOG).locator('[role="alert"]').allInnerTexts()).join(
    ' | ',
  )
  const inToast = (
    await page.locator('[data-type="error"][role="dialog"]').allInnerTexts()
  ).join(' | ')
  const said = [inDialog, inToast].filter((line) => line !== '').join(' || ')
  await closeDialog(page)
  await dismissToasts(page)
  return said === ''
    ? { outcome: 'undriveable', note: `[${String(holding)}/${String(count)} fields set]` }
    : { outcome: 'refused', said }
}

/**
 * The sections whose Add dialog this sweep fills and submits on every run.
 */
const ALWAYS_WRITES = ['accounts', 'actions', 'assets', 'cloud-apps', 'report', 'timeline']

/**
 * Sections that write *sometimes*, with the frequency measured rather than
 * guessed.
 */
const SOMETIMES_WRITES = ['impact', 'malware', 'network']

test('fills every Add dialog and writes a row', async ({ browser }) => {
  test.setTimeout(600_000)
  const { context, page } = await asPersona(browser, ADMIN)
  const wrote: string[] = []
  const refused: string[] = []
  const undriveable: string[] = []
  const skipped: string[] = []

  try {
    await openFirstCase(page)

    for (const { slug } of await sections(page)) {
      await section(page, slug)
      const written = await writeARow(page, MARK)
      if (written.outcome === 'wrote') wrote.push(slug)
      if (written.outcome === 'refused') refused.push(`${slug}: ${written.said}`)
      if (written.outcome === 'undriveable') undriveable.push(`${slug} ${written.note}`)
      if (written.outcome === 'skipped') skipped.push(`${slug} (${written.why})`)
    }

    test.info().annotations.push({
      type: 'wrote',
      description: `${String(wrote.length)}: ${wrote.join(', ')}`,
    })
    test.info().annotations.push({
      type: 'refused',
      description: refused.join(' | ') || 'none',
    })
    /**
     * **Named, so the gap is visible rather than absent.** A sweep that
     * quietly skips two of nine reads as covering nine.
     */
    test.info().annotations.push({
      type: 'not-driven',
      description: undriveable.join(', ') || 'none',
    })
    /**
     * **And the skipped ones, which were collected and never reported.**
     */
    test.info().annotations.push({
      type: 'skipped',
      description: skipped.join(', ') || 'none',
    })

    /**
     * A section that starts writing is a *good* change, and it fails here
     * saying so: the list has to describe the app, not an app.
     * -> `testing/a-floor-passes-the-run-that-lost-a-section`.
     */
    const missing = ALWAYS_WRITES.filter((slug) => !wrote.includes(slug))
    /**
     * **The reason travels with the failure.**
     */
    const why = [...skipped, ...undriveable, ...refused].filter((line) =>
      missing.some((slug) => line.startsWith(`${slug} `) || line.startsWith(`${slug}:`)),
    )
    expect(
      missing,
      `a section that always takes a filled form stopped taking one - ${why.join(' | ') || 'and said nothing'}`,
    ).toEqual([])

    // The other direction: a section nobody expected wrote, which is a change
    // a finding rather than a pass.
    const strangers = wrote.filter(
      (slug) => !ALWAYS_WRITES.includes(slug) && !SOMETIMES_WRITES.includes(slug),
    )
    expect(strangers, 'a new section takes a filled form - add it to the list').toEqual([])

    expect(refused, 'filled forms the server would not take').toEqual([])

    // So the frequency in `SOMETIMES_WRITES` can be re-measured from runs
    // rather than re-guessed.
    test.info().annotations.push({
      type: 'sometimes-wrote',
      description:
        SOMETIMES_WRITES.filter((slug) => wrote.includes(slug)).join(', ') || 'none this run',
    })

    /**
     * **What the sweep could not reach, said out loud.**
     */
    test.info().annotations.push({
      type: 'no-dialog',
      description: `${String(skipped.length)}: ${skipped.join(', ')}`,
    })
  } finally {
    await context.close()
  }
})


/**
 * Whether the mark still appears anywhere in the case document.
 */
async function stillInCase(
  api: APIRequestContext,
  page: Page,
  mark: string,
): Promise<boolean> {
  const caseId = /\/cases\/([0-9a-f-]{36})/i.exec(page.url())?.[1]
  expect(caseId, `no case id in ${page.url()}`).toBeTruthy()

  const answer = await api.get(`/api/cases/${caseId ?? ''}`)
  expect(answer.ok(), `reading the case back answered ${String(answer.status())}`).toBe(true)
  return JSON.stringify(await answer.json()).includes(mark)
}

/**
 * **Ticks the row it just wrote and deletes the selection, on every section
 * that offers one.**
 */
test('ticks the row it wrote and deletes the selection, on every section offering one', async ({
  browser,
}) => {
  test.setTimeout(600_000)
  const { context, page } = await asPersona(browser, ADMIN)
  /** Unique per run: `ensureCase` reuses the case for every test in the file. */
  const mark = `e2ebulk${String(Date.now())}`
  const swept: string[] = []
  const notFound: string[] = []
  const noSelection: string[] = []
  const survived: string[] = []
  const complained: string[] = []

  try {
    await openFirstCase(page)

    for (const { slug } of await sections(page)) {
      await section(page, slug)
      /**
       * **Per section, because the read-back searches the whole case.**
       */
      const own = `${mark}${slug.replace(/-/g, '')}`
      if ((await writeARow(page, own)).outcome !== 'wrote') continue

      /**
       * **The row is found by what was typed into it**, not by position.
       */
      const mine = page.getByRole('row').filter({ hasText: own })
      const found = await mine.count()
      if (found !== 1) {
        /**
         * **Named rather than skipped in silence.**
         */
        notFound.push(`${slug} (${String(found)} rows carry the mark)`)
        continue
      }

      const tick = mine.locator('[data-slot="selection-checkbox"]')
      if ((await tick.count()) === 0) {
        noSelection.push(slug)
        continue
      }
      await tick.first().click()
      await settle(page, 4000)

      /**
       * **`Delete` or `Delete N`, and never a row's own bin.**
       */
      const bulk = page.locator('main').getByRole('button', { name: /^Delete(?: \d+)?$/ })
      if ((await bulk.count()) === 0) {
        noSelection.push(`${slug} (ticked a row, offered no bulk delete)`)
        continue
      }
      // `toHaveCount` rather than `expect(await count())`: it retries, and the
      // control appears a tick after the row is ticked -- so the immediate
      // form was reading a number that was still settling.
      await expect(
        bulk,
        `${slug} did not settle on exactly one control named Delete after one tick`,
      ).toHaveCount(1)
      await bulk.click()

      const dialog = page.locator(DIALOG)
      await expect(dialog, `${slug}: bulk delete opened no confirmation`).toBeVisible()
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
      /**
       * **The confirmation closing is the write landing**, exactly as it is for the
       * Add dialogs above: `ConfirmDeleteDialog` awaits the delete and stays open on
       * a refusal, showing the server's own message.
       */
      if ((await dialog.count()) > 0) {
        await expect(dialog, `${slug}: the confirmation stayed open`).toHaveCount(0, {
          timeout: 20_000,
        })
      }
      await settle(page, 6000)

      /**
       * **Read back from the case, not off the screen.**
       */
      if (await stillInCase(context.request, page, own)) {
        survived.push(slug)
      } else {
        swept.push(slug)
      }
      const said = (await complaints(page).allInnerTexts()).join(' | ')
      if (/invalid|failed|went wrong|could not/i.test(said)) complained.push(`${slug}: ${said}`)
      await dismissToasts(page)
    }

    test.info().annotations.push({
      type: 'bulk-deleted',
      description: `${String(swept.length)}: ${swept.join(', ')}`,
    })
    test.info().annotations.push({
      type: 'no-selection',
      description: noSelection.join(', ') || 'none',
    })
    test.info().annotations.push({
      type: 'wrote-but-not-on-screen',
      description: notFound.join(', ') || 'none',
    })

    /**
     * A floor, because a sweep that ticked nothing passes every assertion
     * below it: the selection controls are transient, so a broken selector and
     * a broken app both look like "found none".
     */
    expect(
      swept.length + survived.length,
      'no section let this sweep tick a row and reach a bulk delete at all',
    ).toBeGreaterThan(0)
    expect(survived, 'sections whose bulk delete left the row in the case').toEqual([])
    expect(complained, 'sections that complained while deleting a selection').toEqual([])
  } finally {
    await context.close()
  }
})
