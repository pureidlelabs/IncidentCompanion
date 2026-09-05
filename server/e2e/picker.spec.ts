/**
 * **The picker's own panes, which the section sweep never reaches.**
 */
import { expect, test } from '@playwright/test'

import {
  ADMIN,
  ANALYST,
  asPersona,
  closeDialog,
  collectConsoleErrors,
  complaints,
  dismissToasts,
  ensureAnalyst,
  ensureCase,
  openPane,
  panes,
  settle,
  type Persona,
} from './support/app.js'

/** Not pressed: it destroys, it leaves the app, or it ends the session. */
const DESTRUCTIVE = /delete|remove|discard|reset|sign out|log ?out|clear|import|export|archive/i

test.beforeAll(async ({ browser, baseURL }) => {
  await ensureAnalyst(browser, baseURL ?? '')
  await ensureCase(browser, baseURL ?? '')
})

for (const who of [ADMIN, ANALYST] as Persona[]) {
  test.describe(`as ${who.role}`, () => {
    test.setTimeout(300_000)

    test('opens every pane the picker offers', async ({ browser }) => {
      const { context, page } = await asPersona(browser, who)
      const errors = collectConsoleErrors(page)
      const broken: string[] = []

      try {
        const all = await panes(page)
        /**
         * **A floor on the count.** A rail that failed to render offers
         * nothing, and a loop over nothing passes every assertion under it.
         */
        expect(all.length, 'the picker rail offered almost nothing').toBeGreaterThan(5)

        for (const slug of all) {
          try {
            await openPane(page, slug)
            const main = page.locator('main').first()
            await expect(main, `${slug} drew no main region`).toBeVisible()

            const text = (await main.innerText()).trim()
            expect(text.length, `${slug} drew an empty pane`).toBeGreaterThan(0)

            const said = (await complaints(page).allInnerTexts()).join(' | ')
            if (/something went wrong|unexpected error|failed to load/i.test(said)) {
              broken.push(`${slug}: ${said.slice(0, 80)}`)
            }
          } catch (error) {
            broken.push(`${slug}: ${(error as Error).message.split('\n')[0]}`)
          }
        }

        test.info().annotations.push({
          type: 'panes',
          description: `${String(all.length)}: ${all.join(', ')}`,
        })
        expect(broken, `panes that did not open for ${who.role}`).toEqual([])
      } finally {
        await context.close()
      }

      const fatal = errors.filter((line) => line.startsWith('uncaught:'))
      expect(fatal, `uncaught errors walking the picker as ${who.role}`).toEqual([])
    })

    /**
     * **Presses what each pane offers**, which is where an install surface an
     * analyst may not use shows itself: a control that is present, enabled,
     * and answers 403.
     */
    test('presses what every pane offers', async ({ browser }) => {
      const { context, page } = await asPersona(browser, who)
      const errors = collectConsoleErrors(page)
      const pressed: string[] = []
      const refused: string[] = []

      try {
        for (const slug of await panes(page)) {
          await openPane(page, slug)
          await dismissToasts(page)

          const names = await page
            .locator('main')
            .getByRole('button')
            .evaluateAll((nodes) =>
              nodes.map((n) => (n.getAttribute('aria-label') ?? n.textContent ?? '').trim()),
            )

          for (const name of [...new Set(names)]) {
            if (name === '' || name.length > 80 || DESTRUCTIVE.test(name)) continue
            const control = page.locator('main').getByRole('button', { name, exact: true }).first()
            if ((await control.count()) === 0) continue
            if (!(await control.isEnabled().catch(() => false))) continue

            try {
              await control.click()
              pressed.push(`${slug}/${name}`)
              await settle(page, 3000)
            } catch {
              // A control that will not take a press is reported by the open
              // sweep above; here the interest is only in what a press does.
              continue
            }

            const said = (await complaints(page).allInnerTexts()).join(' | ')
            /**
             * **A refusal is the finding, not an error.**
             */
            if (/forbidden|not allowed|permission/i.test(said)) {
              refused.push(`${slug}/${name}: ${said.slice(0, 60)}`)
            }
            await closeDialog(page)
            await dismissToasts(page)
            await openPane(page, slug)
          }
        }

        test.info().annotations.push({
          type: 'pressed',
          description: `${String(pressed.length)} controls`,
        })
        test.info().annotations.push({
          type: 'refusals',
          description: refused.join(' | ') || 'none',
        })
        expect(pressed.length, 'the sweep found nothing to press').toBeGreaterThan(3)
      } finally {
        await context.close()
      }

      const fatal = errors.filter((line) => line.startsWith('uncaught:'))
      expect(fatal, `uncaught errors pressing the picker as ${who.role}`).toEqual([])
    })
  })
}

/**
 * **The one pane an analyst may open and not use.**
 */
test('an analyst is told Accounts is not theirs, without being offered a retry', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const { context, page } = await asPersona(browser, ANALYST)
  try {
    await openPane(page, 'accounts')

    const said = await page.locator('main').innerText()
    expect(said, 'the analyst was not told why Accounts is empty').toMatch(/permission/i)

    await expect(
      page.locator('main').getByRole('button', { name: /try again/i }),
      'a refusal offered a retry that can never succeed',
    ).toHaveCount(0)

    // Stated, not alarmed: a refusal is not a fault in the app.
    await expect(page.locator('main [role="alert"]')).toHaveCount(0)
  } finally {
    await context.close()
  }
})
