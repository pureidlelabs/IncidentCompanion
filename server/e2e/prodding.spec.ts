/**
 * **Press every control on every screen, and fill every dialog.**
 *
 * This is the only tier that can see two halves which are each correct and
 * disagree - a client posting one body while its own route demands another
 * passes the server suite and the React suite and renders perfectly. It is
 * also the only one that can see a control which is present, enabled, and
 * wired to nothing.
 *
 * **Run as both people**, because a control an analyst can press that answers
 * 403 is a defect the admin's run cannot produce. The routes behind
 * `@AdminOnly()` are the ones whose screens nobody looks at twice.
 *
 * **What it does not press.** Anything whose name says it destroys - Delete,
 * Remove, Sign out - and anything that leaves the app. A sweep that deletes
 * walks its own fixture out from under the specs that follow it, and this tier
 * shares one database across the file. Destruction is asserted deliberately in
 * its own spec, against a row it created.
 *
 * **Never `test.describe.configure({ mode: 'serial' })` here.** Under serial a
 * failure *skips* every test after it, so one timeout reports three untested
 * screens as "skipped" and the run reads as a single defect rather than as an
 * unmeasured sweep.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  ADMIN,
  ANALYST,
  DIALOG,
  asPersona,
  closeDialog,
  collectConsoleErrors,
  complaints,
  dismissToasts,
  ensureAnalyst,
  ensureCase,
  openAddDialog,
  openFirstCase,
  section,
  sections,
  settle,
  type Persona,
} from './support/app.js'

/**
 * **Named by what they do, not by which screen they are on.** A list of
 * screen-specific exceptions goes stale the moment a screen is renamed; a verb
 * that destroys keeps destroying.
 */
const DESTRUCTIVE = /delete|remove|discard|reset|sign out|log ?out|clear|archive|export|import/i

test.beforeAll(async ({ browser, baseURL }) => {
  await ensureAnalyst(browser, baseURL ?? '')
  await ensureCase(browser, baseURL ?? '')
})

for (const who of [ADMIN, ANALYST] as Persona[]) {
  test.describe(`as ${who.role}`, () => {
    test.setTimeout(600_000)

    test('presses every control on every section', async ({ browser }) => {
      const { context, page } = await asPersona(browser, who)
      const errors = collectConsoleErrors(page)
      const pressed: string[] = []
      const broke: string[] = []

      try {
        await openFirstCase(page)
        for (const { slug } of await sections(page)) {
          await section(page, slug)
          const names = await pressableNames(page)

          for (const name of names) {
            if (DESTRUCTIVE.test(name)) continue
            /**
             * **Re-found by name before every press, never held.**
             * `pressableNames` returns strings for the same reason: a press can
             * re-render the pane, and an element handle taken before it points
             * at a node the document no longer has.
             */
            const control = page.locator('main').getByRole('button', { name, exact: true }).first()
            if ((await control.count()) === 0) continue
            if (!(await control.isEnabled().catch(() => false))) continue

            try {
              await control.click()
              pressed.push(`${slug}/${name}`)
              await settle(page, 4000)
              /**
               * **The answer is the finding, and ignoring it moves the blame.**
               * Something left open swallows every later click, so one stuck
               * overlay reports a timeout on every control after it - which
               * reads as a row of broken controls rather than as one that would
               * not close. Naming it here charges the failure to the press that
               * caused it.
               */
              if ((await closeDialog(page)) === 'stuck') {
                broke.push(`${slug}/${name}: opened something Escape and its own close button will not shut`)
              }
              const said = await fatalComplaint(page)
              if (said) broke.push(`${slug}/${name}: ${said}`)
            } catch (error) {
              broke.push(`${slug}/${name}: ${(error as Error).message.split('\n')[0]}`)
            }

            if (!page.url().endsWith(`/${slug}`)) await section(page, slug)
          }
        }

        /**
         * **Per section, not a total.** One number over every screen reads as
         * coverage whatever it is; the breakdown is what shows a section the
         * sweep walked onto and found nothing to press.
         */
        const perSection = new Map<string, number>()
        for (const entry of pressed) {
          const slug = entry.split('/')[0] ?? ''
          perSection.set(slug, (perSection.get(slug) ?? 0) + 1)
        }
        test.info().annotations.push({
          type: 'pressed',
          description: `${String(pressed.length)} controls \u2014 ${[...perSection]
            .map(([slug, n]) => `${slug}:${String(n)}`)
            .join(' ')}`,
        })
        /**
         * **A sweep that pressed nothing passes every assertion below it.**
         * This is the empty-set shape: `broke` is empty because the loop never
         * ran, and the run reports clean over a screen it never touched.
         */
        expect(pressed.length, 'the sweep found no controls to press at all').toBeGreaterThan(20)
        expect(broke, `controls that failed for ${who.role}`).toEqual([])
      } finally {
        await context.close()
      }

      const fatal = errors.filter((line) => line.startsWith('uncaught:'))
      expect(fatal, `uncaught errors while pressing as ${who.role}`).toEqual([])
    })

    /**
     * **Opens every Add dialog and submits it empty**, which is the question
     * no other tier can ask: does a refused write say so on the screen, or does
     * the dialog sit there having thrown into the console?
     *
     * **Empty rather than filled, deliberately.** A filled submit tests the
     * happy path the unit tier already covers; an empty one tests the seam
     * between the client's own validation and the server's 422 - and it is the
     * one that leaves no row behind for the next spec to trip over.
     */
    test('opens every Add dialog and refuses an empty one on screen', async ({ browser }) => {
      const { context, page } = await asPersona(browser, who)
      const errors = collectConsoleErrors(page)
      const opened: string[] = []
      const silent: string[] = []
      const stubborn: string[] = []
      const blocked: string[] = []
      const refusals: string[] = []
      let cleared = 0

      try {
        await openFirstCase(page)
        for (const { slug } of await sections(page)) {
          await section(page, slug)
          // A pinned toast from the previous section covers this one's Create
          // button; cleared so this test measures dialogs rather than that.
          cleared += await dismissToasts(page)
          if (!(await openAddDialog(page).catch(() => false))) continue
          opened.push(slug)
          test.info().annotations.push({ type: 'reached', description: slug })

          const dialog = page.locator(DIALOG)
          const submit = dialog
            .getByRole('button', { name: /^(add|save|create|record)\b/i })
            .first()
          if ((await submit.count()) === 0) {
            await closeDialog(page)
            continue
          }

          /**
           * **A disabled submit is a refusal, and a valid one.** The dialog
           * that will not let an empty form be sent has answered the question
           * this test asks; only a dialog that *accepts* the press owes a
           * visible complaint afterwards.
           */
          if (await submit.isDisabled()) {
            await closeDialog(page)
            continue
          }

          /**
           * **A blocked click is recorded, not thrown.** Pressing Create can
           * fail because something is painted over it - which is a finding
           * about *this* screen, and throwing it ends the sweep before every
           * screen after it is looked at. The message names what
           * intercepted the press, which is the whole diagnosis.
           */
          try {
            await submit.click()
          } catch (error) {
            const why = /intercepts pointer events/.test((error as Error).message)
              ? interceptor((error as Error).message)
              : (error as Error).message.split('\n')[0]
            blocked.push(`${slug}: ${why}`)
            await closeDialog(page)
            continue
          }
          await settle(page, 4000)

          const stillOpen = (await page.locator(DIALOG).count()) > 0
          const said = (await complaints(page).allInnerTexts()).join(' ').trim()
          if (stillOpen && said.length === 0) silent.push(slug)
          if (said.length > 0) refusals.push(`${slug}: ${said.slice(0, 80)}`)

          /**
           * **A dialog that will not close is reported, not tolerated.** Escape
           * is the contract every dialog here owes; needing its own button is a
           * finding, and needing neither leaves a dialog open that hangs the
           * whole sweep on the next section's navigation click.
           */
          const closed = await closeDialog(page)
          if (closed !== 'closed') stubborn.push(`${slug}: ${closed}`)
        }

        test.info().annotations.push({
          type: 'add-dialogs',
          description: `${String(opened.length)}: ${opened.join(', ')}`,
        })
        expect(opened.length, 'no section offered an Add dialog').toBeGreaterThan(3)
        expect(
          silent,
          `sections whose Add dialog refused an empty form without saying so`,
        ).toEqual([])
        test.info().annotations.push({
          type: 'refusals',
          description: refusals.join(' | ') || 'none',
        })
        test.info().annotations.push({
          type: 'toasts-cleared',
          description: `${String(cleared)} pinned error toasts had to be dismissed to reach a dialog`,
        })
        expect(stubborn, 'dialogs that did not close on Escape').toEqual([])
        expect(blocked, 'Add dialogs whose submit could not be pressed').toEqual([])

        /**
         * **The status phrase is not a message.** "Unprocessable Entity" is
         * what the wire calls a 422; an analyst reading it learns nothing about
         * which field was wrong. A refusal that surfaces the raw phrase means
         * the field-level detail the server sent was thrown away.
         */
        expect(
          refusals.filter((line) => /unprocessable|bad request|internal server/i.test(line)),
          'refusals showing the HTTP status phrase instead of naming the field',
        ).toEqual([])
      } finally {
        await context.close()
      }

      const fatal = errors.filter((line) => line.startsWith('uncaught:'))
      expect(fatal, `uncaught errors while filling dialogs as ${who.role}`).toEqual([])
    })

    /**
     * **There is no fill-and-send test here, and that is deliberate.**
     * `writing.spec.ts` owns it: `writeARow` drives every control kind, knows
     * which sections write reliably and which are provisional, and annotates
     * what it could not drive. Two sweeps disagreeing about which sections
     * write is worse than one.
     *
     * What this file owns is the other half - pressing every control, and
     * submitting an *empty* dialog to see whether a refusal reaches the
     * screen.
     */
  })
}

/** The element Playwright says was in the way, out of its actionability log. */
function interceptor(message: string): string {
  const line = message.split('\n').find((l) => l.includes('intercepts pointer events'))
  return line ? `blocked by ${line.trim().replace(/^-\s*/, '').slice(0, 120)}` : 'blocked'
}

async function pressableNames(page: Page): Promise<string[]> {
  const buttons: Locator = page.locator('main').getByRole('button')
  const names = await buttons.evaluateAll((nodes) =>
    nodes.map((node) => (node.getAttribute('aria-label') ?? node.textContent ?? '').trim()),
  )
  return [...new Set(names.filter((name) => name.length > 0 && name.length < 80))]
}

/**
 * What the page is saying went wrong, when it is the kind that matters.
 *
 * **A validation message is not a failure.** Pressing Save on an empty form
 * *should* complain; a boundary replacing the screen should not. Only the
 * second is reported.
 */
async function fatalComplaint(page: Page): Promise<string | null> {
  const said = (await complaints(page).allInnerTexts()).join(' | ')
  return /something went wrong|unexpected error|failed to load/i.test(said) ? said : null
}
