/**
 * **The picker's own panes, which the section sweep never reaches.**
 *
 * `prodding.spec.ts` opens a case and walks the rail inside it; the sign-in
 * spec asserts the picker appeared and then stops.
 *
 * Run as both people on purpose. Accounts and Settings are the surfaces where
 * an analyst seeing something they may not act on is a real defect, and the
 * admin's run cannot produce it.
 */
import { expect, test } from '@playwright/test'

import {
  ADMIN,
  ANALYST,
  asPersona,
  closeDialog,
  collectConsoleErrors,
  collectRefusals,
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

    test('presses what every pane offers', async ({ browser }) => {
      const { context, page } = await asPersona(browser, who)
      const errors = collectConsoleErrors(page)
      const wire = collectRefusals(page)
      const pressed: string[] = []
      const refused: string[] = []
      const unsaid: string[] = []

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

            const before = wire.length
            try {
              await control.click()
              pressed.push(`${slug}/${name}`)
              await settle(page, 3000)
            } catch {
              // The subject here is what a press does, so a control that will
              // not take one is not this sweep's finding.
              continue
            }

            const said = (await complaints(page).allInnerTexts()).join(' | ')
            /**
             * **A refusal is the finding, not an error.** An analyst pressing
             * something they may not use should be told; a control that
             * answers 403 with nothing on screen is the defect this sweep
             * exists for.
             *
             * **So it is read from the wire as well as the page**, because the
             * two are indistinguishable from the page alone: a refusal nobody
             * drew leaves exactly the screen a press that did nothing leaves.
             */
            const sent = wire.slice(before)
            if (sent.length > 0 && said.trim() === '') {
              unsaid.push(`${slug}/${name}: ${sent.join(', ')}`)
            }
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
        expect(
          unsaid,
          `controls refused on the wire with nothing on screen, for ${who.role}`,
        ).toEqual([])
      } finally {
        await context.close()
      }

      const fatal = errors.filter((line) => line.startsWith('uncaught:'))
      expect(fatal, `uncaught errors pressing the picker as ${who.role}`).toEqual([])
    })
  })
}

/**
 * **The rail an analyst is served, read off the shipped bundle.**
 *
 * Three System panes are served entirely by `@AdminOnly` controllers and
 * Health's two routes were gated when it turned out a per-table row count
 * answers how many accounts exist. The rail stopped drawing all four, and what
 * replaced the old refusal is an absence -- which is the harder thing to hold,
 * because a rail that failed to render is also an absence.
 *
 * So both halves are asserted against one another: the administrator is
 * offered every one of them, and the analyst none, from the same page object
 * on the same build. `picker-panes.test.ts` holds the same rule over
 * `panesFor`, and cannot see whether the rail it feeds ever reached the screen.
 */
const ADMIN_ONLY = ['accounts', 'activity', 'administration', 'health']

test('the rail offers an analyst none of the panes that would refuse them', async ({ browser }) => {
  test.setTimeout(120_000)

  const asAdmin = await asPersona(browser, ADMIN)
  let offeredToAdmin: string[]
  try {
    offeredToAdmin = await panes(asAdmin.page)
  } finally {
    await asAdmin.context.close()
  }

  // **The control, and it is what makes the assertion below mean anything.** A
  // rail that drew nothing at all satisfies "the analyst is offered none of
  // them" perfectly, and so does a slug that was renamed on both sides.
  expect(
    ADMIN_ONLY.filter((slug) => !offeredToAdmin.includes(slug)),
    'an administrator was not offered these, so the names or the rail have moved',
  ).toEqual([])

  const { context, page } = await asPersona(browser, ANALYST)
  try {
    const offered = await panes(page)

    expect(offered.length, 'the analyst rail offered almost nothing').toBeGreaterThan(5)

    /**
     * **The difference, not the subset.** Asserting only that the analyst is
     * offered none of the four leaves the list to go stale in silence: a fifth
     * admin-only pane added later is invisible here, so a refactor dropping its
     * `admin: true` hands an analyst a pane every route of which refuses them
     * while the test written for exactly that stays green.
     *
     * Read as a difference it fails the moment a fifth appears, which is the
     * moment somebody should be adding it to this list.
     */
    expect(
      offeredToAdmin.filter((slug) => !offered.includes(slug)).sort(),
      'the panes an administrator has and an analyst does not are no longer these',
    ).toEqual([...ADMIN_ONLY].sort())

    // Its `@Get()` is open and only the upload and the delete are admin, so
    // hiding the pane would take away a list an analyst may read.
    expect(offered, 'the analyst lost a pane they may use').toContain('languages')
  } finally {
    await context.close()
  }
})
