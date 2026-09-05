/**
 * **Press every control on every screen, and fill every dialog.**
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
 * **Named by what they do, not by which screen they are on.**
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
             */
            const control = page.locator('main').getByRole('button', { name, exact: true }).first()
            if ((await control.count()) === 0) continue
            if (!(await control.isEnabled().catch(() => false))) continue

            try {
              await control.click()
              pressed.push(`${slug}/${name}`)
              await settle(page, 4000)
              /**
               * **The answer is the finding, and ignoring it moved the blame.**
               */
              if ((await closeDialog(page)) === 'stuck') {
                broke.push(`${slug}/${name}: opened something Escape and its own close button will not shut`)
              }
              const said = await fatalComplaint(page)
              if (said) broke.push(`${slug}/${name}: ${said}`)
            } catch (error) {
              broke.push(`${slug}/${name}: ${(error as Error).message.split('\n')[0]}`)
            }

            // Back to the screen under test: a press may have navigated.
            if (!page.url().endsWith(`/${slug}`)) await section(page, slug)
          }
        }

        /**
         * **Per section, not a total.** "34 controls" over 22 screens reads as
         * coverage and is 1.5 a screen; the breakdown is what shows a section
         * the sweep walked onto and found nothing to press.
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
           * **A disabled submit is a refusal, and a valid one.**
           */
          if (await submit.isDisabled()) {
            await closeDialog(page)
            continue
          }

          /**
           * **A blocked click is recorded, not thrown.**
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
           * **A dialog that will not close is reported, not tolerated.**
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
         * **The status phrase is not a message.** "Unprocessable Entity" is what the
         * wire calls a 422; an analyst reading it learns nothing about which field was
         * wrong.
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
     */
  })
}

/** The element Playwright says was in the way, out of its actionability log. */
function interceptor(message: string): string {
  const line = message.split('\n').find((l) => l.includes('intercepts pointer events'))
  return line ? `blocked by ${line.trim().replace(/^-\s*/, '').slice(0, 120)}` : 'blocked'
}

/** The accessible names of everything pressable in the pane, deduplicated. */
async function pressableNames(page: Page): Promise<string[]> {
  const buttons: Locator = page.locator('main').getByRole('button')
  const names = await buttons.evaluateAll((nodes) =>
    nodes.map((node) => (node.getAttribute('aria-label') ?? node.textContent ?? '').trim()),
  )
  return [...new Set(names.filter((name) => name.length > 0 && name.length < 80))]
}

/**
 * What the page is saying went wrong, when it is the kind that matters.
 */
async function fatalComplaint(page: Page): Promise<string | null> {
  const said = (await complaints(page).allInnerTexts()).join(' | ')
  return /something went wrong|unexpected error|failed to load/i.test(said) ? said : null
}
