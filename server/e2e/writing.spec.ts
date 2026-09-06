/**
 * **Fill every Add dialog and submit it, which is the half the empty-form
 * sweep cannot reach.** `prodding.spec.ts` submits each dialog empty and so
 * never sends a body the server accepts.
 *
 * It writes into the tier's own case and throws that case away at the end, so
 * rows do not accumulate across runs.
 *
 * -> `testing/a-read-only-browser-tier-cannot-see-a-contract-disagreement`.
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
 * **`beforeEach`, not `beforeAll`, because only the former may skip.** Without
 * a running server or a built `ui/dist` this file has nothing to assert, and a
 * hard failure there says "the app is broken" about an install that was never
 * started. -> `requireServedApp`
 */
test.beforeEach(async ({ browser, baseURL }) => {
  await requireServedApp(baseURL ?? '')
  await ensureCase(browser, baseURL ?? '')
})

/**
 * **The fixture case is deleted, not tidied row by row.** One call against the
 * case beats a delete per collection, and it cannot leave a row behind because
 * it does not enumerate them. `ensureCase` builds a fresh one next run.
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
 *
 * **Read off the DOM, not off a table of field names.** A list keyed by field
 * would go stale the moment a form gains one, and the point of this sweep is
 * to exercise forms nobody remembered to add to a list.
 */
async function fill(control: Locator, mark: string): Promise<string | null> {
  const kind = await control.evaluate((node) => ({
    tag: node.tagName,
    type: (node as HTMLInputElement).type,
    required: (node as HTMLInputElement).required,
    // **The shape, because the platform types are not used.** A UTC timestamp
    // is two text boxes rather than `type="date"` and `type="time"`, which
    // render in the operating system's locale where no attribute reaches them
    // - so a field labelled UTC would draw `mm/dd/yyyy` and a twelve-hour
    // clock. Keying off `type` alone types the mark into a box that wants a
    // date, and the form then refuses for a reason that has nothing to do with
    // the write path.
    shape: (node as HTMLInputElement).placeholder,
  }))

  if (kind.tag === 'SELECT') return null
  if (kind.type === 'checkbox' || kind.type === 'radio') return null
  if (kind.type === 'file') return null

  /**
   * **A datetime-local field takes its own format and nothing else.** Typing
   * prose into one leaves it empty, the form then refuses for a reason that
   * has nothing to do with the write path, and the sweep reports a defect in
   * the wrong place.
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
   * exclude it.** Base UI mirrors a select's value into
   * `#<id>-hidden-input` for a native form submit, and typing into that is
   * typing into the select - which then holds a value outside its own
   * vocabulary.
   *
   * A select with no options has nothing to disagree with, so this is silent
   * until the field gains a served vocabulary.
   *
   * **A combobox is excluded for a different reason, and it is the one that
   * cost a day.** A link field's input has `role="combobox"`, and typing into
   * it opens its suggestion list rather than holding a value - the mark
   * matches no entity, so nothing is ever chosen and the fill contributes
   * nothing to the payload. What it does contribute is an open popup: Base UI
   * popups are `modal` by default, which marks everything outside them
   * `aria-hidden`, so while a suggestion list is open the dialog's own Save
   * button is present, enabled, and outside the accessibility tree that
   * `getByRole` reads -- filling a link field takes the buttons `getByRole` can
   * see inside the dialog down to the popup's own, and Escape puts them back.
   *
   * **So the sweep reported "no submit control" for a dialog it had just
   * filled** - and only on this dialog, because the tier layout put the link
   * band last, leaving a popup open at the moment the submit was looked for.
   * The app is right: a modal popup is meant to take the screen, and an
   * analyst dismisses it before saving.
   *
   * **What it gives up, said out loud.** These are the `device_select` and
   * `multi_device_select` controls - 7 of the event form's 15, 6 of the
   * action form's 11 - so neither browser sweep now drives a reference picker
   * *inside a dialog*: this one skips them and `prodding.spec.ts` submits
   * empty by design. No section drops to zero fillable controls, so the
   * exclusion cannot hide a section that stopped writing; what it can hide is
   * a regression in `EntityCombobox` or `ReferenceMultiSelect`, which is
   * precisely the surface that broke here.
   */
  return page
    .locator(DIALOG)
    .locator(
      'input:not([type="hidden"]):not([id$="-hidden-input"]):not([role="combobox"]), textarea',
    )
}

/**
 * What one section's Add dialog did with a filled form.
 *
 * **Four outcomes, and the last two are the reason this is not a boolean.**
 * `refused` is a real finding - the class this file exists for. `undriveable`
 * is the harness failing to fill a widget, and calling it a refusal claims a
 * defect in the app for a limitation of the sweep. `skipped` is a section with
 * no dialog or nothing to type.
 *
 * **`skipped` carries why, because three unrelated things answer it** - no
 * door, nothing fillable behind the door, and a door whose submit control is
 * absent or disabled. A branch that lost its Save button and a section that
 * never had a form read identically without it, and one of them is a defect.
 */
type Written =
  | { outcome: 'wrote' }
  | { outcome: 'skipped'; why: string }
  | { outcome: 'refused'; said: string }
  | { outcome: 'undriveable'; note: string }

/**
 * Opens the current section's Add dialog, fills it with `mark`, submits it.
 *
 * **Shared by both sweeps rather than copied**, because the second one needs
 * exactly this and needs it to have written a row it can then find by its
 * mark - a second filler would drift from this one and the round trip would
 * be certifying a form nobody submits.
 */
async function writeARow(page: Page, mark: string): Promise<Written> {
  await dismissToasts(page)
  /**
   * **A door that is not there and a door that threw are different findings.**
   * Answering both `skipped` reports a dialog that failed to open - the
   * loudest thing a section can do - as "nothing to type here", beside the
   * graphs and the overview which genuinely have no door.
   */
  const door = await openAddDialog(page).catch((error: Error) => error)
  if (door instanceof Error) {
    return { outcome: 'undriveable', note: `Add threw: ${door.message.split('\n')[0] ?? ''}` }
  }
  if (!door) return { outcome: 'skipped', why: 'no Add door' }

  /**
   * **Every value is read back, and a lost one is retried once.** The dialog
   * re-renders as the draft changes, so a handle taken before the loop can
   * address a node React has replaced - and filling by index against one
   * leaves only the *last* field set while looking like it worked. A sweep
   * that silently fills one field of nine reports the form as refusing a
   * complete submission, which is a finding about nothing.
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
   * **What the form is actually holding, before it is submitted.** Without
   * it a refusal cannot be told apart from a form the sweep failed to fill.
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
     * **Every button the dialog does offer, named.** A submit control that is
     * absent is indistinguishable from one whose label stopped matching, and
     * the two are a defect and a stale selector respectively.
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
   * **The dialog closing is the write landing.** Every one of these forms
   * stays open on a refusal so the analyst can fix the field - which is
   * what makes "still open" the signal rather than a guess.
   */
  const stillOpen = (await page.locator(DIALOG).count()) > 0
  /**
   * **Three outcomes, not two.** Closed wrote its row. Open *and saying why*
   * is a refusal, the class this spec exists for. Open and silent is
   * `undriveable` and is never reported as a refusal: it cannot be told apart
   * from a widget this sweep failed to fill, which the portalled
   * autocompletes and tag selects are.
   */
  if (!stillOpen) {
    await dismissToasts(page)
    return { outcome: 'wrote' }
  }

  /**
   * **The complaint, not the dialog.** A dialog's whole text is its
   * labels and its help copy; what tells a real refusal from a field
   * this sweep could not fill is the message beside the field.
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
 * Named rather than counted, so a section that stops taking a form is named by
 * the failure.
 *
 * A section belongs here once it has written on consecutive runs rather than
 * on one; the `wrote` annotation is what says which.
 */
const ALWAYS_WRITES = ['accounts', 'actions', 'assets', 'cloud-apps', 'report', 'timeline']

/**
 * Sections that write *sometimes*, with the frequency measured rather than
 * guessed.
 *
 * Neither required nor forbidden: requiring them makes this spec fail most
 * runs, and forbidding them makes a successful run red for succeeding. Neither
 * outcome is a statement about the app.
 *
 * A section here writes rarely, or only under the full parallel tier. Move one
 * to `ALWAYS_WRITES` once it writes reliably, and re-measure before deciding
 * that it does: the `wrote` annotation is the instrument.
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
     * **And the skipped ones, which are otherwise collected and never
     * reported.**
     * `skipped` covers a section with no Add dialog *and* one whose dialog had
     * nothing this sweep could type - two very different things, both silent.
     * A section that stops writing shows up in the failure below as a bare
     * slug with no reason attached, which is a diagnosis that starts from
     * nothing.
     */
    test.info().annotations.push({
      type: 'skipped',
      description: skipped.join(', ') || 'none',
    })

    /**
     * A section that starts writing is a *good* change, and it fails here
     * saying so: the list has to describe the app, not an app.
     */
    const missing = ALWAYS_WRITES.filter((slug) => !wrote.includes(slug))
    /**
     * **The reason travels with the failure.** A bare slug here is a diagnosis
     * that starts from nothing, and the annotations are not in the failure
     * message - so the one line a reader gets carries what the section did
     * instead of writing.
     */
    const why = [...skipped, ...undriveable, ...refused].filter((line) =>
      missing.some((slug) => line.startsWith(`${slug} `) || line.startsWith(`${slug}:`)),
    )
    expect(
      missing,
      `a section that always takes a filled form stopped taking one - ${why.join(' | ') || 'and said nothing'}`,
    ).toEqual([])

    // The other direction: a section nobody expected wrote, which is a change
    // to record rather than a pass.
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
     * **What the sweep could not reach, said out loud.** A dialog it cannot
     * fill and a section that offers none are different answers, and neither
     * is a defect - but a sweep that reports 5 of 22 without saying which 17
     * reads as covering the case.
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
 *
 * **Serialised and searched rather than walked per collection.** The mark is a
 * unique run token written into one text field, so a substring hit is the row
 * and nothing else - and this needs no slug-to-collection map, which is the
 * thing that made the obvious port of `bulk-delete.spec.ts` fail.
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
 *
 * **It lives here rather than in `prodding.spec` because it has to own the row
 * it deletes.** That sweep shares one case with every spec on its worker and
 * so refuses anything whose name destroys, and the selection controls do not
 * exist until a row is ticked, so reading the pane's buttons cannot find them.
 *
 * **It deletes only its own mark**, and this file throws the whole case away
 * afterwards.
 *
 * **The claim is the round trip, not the click.** A row written through the
 * form, found in the table by what was typed into it, ticked, deleted through
 * the bulk path, and gone. What is new over the sweep above is that the delete
 * a *selection* reaches is the same row and the same collection - which is
 * precisely what a client keying a selection by collection name can get wrong
 * for a collection whose name is more than one word, and what every tier below
 * the browser certifies as correct.
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
       * **Per section, because the read-back searches the whole case.** One
       * mark for the run cannot say whose row it is: a section that offers no
       * bulk delete keeps the row it wrote, so its mark stays in the case and
       * every later section then reads as though its own delete had failed.
       */
      const own = `${mark}${slug.replace(/-/g, '')}`
      if ((await writeARow(page, own)).outcome !== 'wrote') continue

      /**
       * **The row is found by what was typed into it**, not by position. A
       * table that sorts newest-last puts the new row off the bottom of a long
       * list, and `.first()` would then tick and delete somebody else's.
       */
      const mine = page.getByRole('row').filter({ hasText: own })
      const found = await mine.count()
      if (found !== 1) {
        /**
         * **Named rather than skipped in silence.** A row that was written and
         * cannot be found again is either a table this sweep cannot read or a
         * write that did not land where the analyst looks - and both read as
         * "no section offered a bulk delete", which is the empty-set shape.
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
       * `BulkActionBar` writes the count into the label and a bar without one
       * does not, so both spellings are the control; a row's delete is
       * `Delete <identity>`, which neither matches. Asserting
       * exactly one match is what keeps this from silently pressing the wrong
       * one the day a label changes.
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
       * **The confirmation closing is the write landing** only where the
       * screen's `onConfirm` returns a promise: `ConfirmDeleteDialog` awaits a
       * thenable and stays open on a refusal, showing the server's own
       * message, and closes at once otherwise. Where it does await, a 400 on
       * the wire is a failure here that names the reason rather than a timeout.
       */
      if ((await dialog.count()) > 0) {
        await expect(dialog, `${slug}: the confirmation stayed open`).toHaveCount(0, {
          timeout: 20_000,
        })
      }
      await settle(page, 6000)

      /**
       * **Read back from the case, not off the screen.** A table that has not
       * refetched, a row scrolled out of a virtualised list and a filter that
       * excludes the mark all look exactly like a delete that landed.
       *
       * **The whole case, not the slug's own collection**, since a slug is not
       * a collection name - `assets` is `systems` - and the map carrying both
       * is the client's, which this tier cannot import. The weaker query
       * asserts the stronger property.
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
     *
     * **One, not every screen that offers a selection.** This sweep's reach is
     * whatever the sweep above could write, which is a fraction of the
     * sections. A shrinking reach shows up in the `wrote-but-not-on-screen`
     * and `no-selection` annotations, not here.
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
