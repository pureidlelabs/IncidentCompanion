/**
 * The picker's own doors, which the sweep walks past.
 *
 * **`npm run visual` captures every picker pane and presses none of them.**
 * "Start a case" is two cards, and everything an analyst actually fills in -
 * the case fields, the template pane - is behind the first one, so the sweep
 * captures the door and never the room. This closes the half of that with a
 * form behind it.
 *
 * ```bash
 * npx playwright test e2e/visual/picker-doors.spec.ts \
 *   --config=e2e/visual/playwright.visual.config.ts
 * ```
 */
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { ADMIN, asPersona, openPane, requireServedApp, settle } from '../support/app.js'
import { findings, setGround, sayFinding } from './view.js'

const OUT = process.env['SHOT_DIR'] ?? join(process.cwd(), '.visual', 'doors')
const GROUNDS = (process.env['VISUAL_GROUNDS'] ?? 'light,dark').split(',') as ('light' | 'dark')[]

test('captures the new-case form behind the Blank case door', async ({ browser, baseURL }) => {
  await requireServedApp(baseURL ?? '')

  const { page } = await asPersona(browser, ADMIN)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await settle(page)

  for (const ground of GROUNDS) {
    await setGround(page, ground)
    await page.getByRole('button', { name: /New case/i }).first().click()
    await page.getByRole('button', { name: /Blank case/i }).click()
    await settle(page)

    // The form is the pane, not a dialog: this door replaces the two cards in
    // place rather than opening over them.
    const title = page.getByLabel(/^Title/)
    await expect(title).toBeVisible()
    await page.screenshot({ path: join(OUT, `${ground}-new-case.png`), fullPage: false })

    /**
     * **The pane's height, which is the whole reason it was rebuilt.** The
     * template grid it replaced grew a row per pair of templates with nothing
     * to stop it; a rail and a scrolling list are the same size whatever the
     * library holds. Printed rather than asserted, because the number is a
     * judgement - the tier reports and the reader decides.
     */
    const pane = await page.evaluate(() => {
      const list = document.querySelector('[data-slot="dialog-pane"]')
      return list === null
        ? null
        : { visible: list.clientHeight, content: list.scrollHeight }
    })
    process.stdout.write(`PANE ${ground} ${JSON.stringify(pane)}\n`)

    for (const one of await findings(page)) process.stdout.write(`  ${sayFinding(one)}\n`)

    await page.goto('/')
    await settle(page)
  }
})

test('captures the new-account dialog', async ({ browser, baseURL }) => {
  await requireServedApp(baseURL ?? '')

  const { page } = await asPersona(browser, ADMIN)
  await page.setViewportSize({ width: 1440, height: 900 })

  for (const ground of GROUNDS) {
    // **Ground first, then the pane.** The other specs in this tier do it in
    // that order, and reversed it landed back on Your cases every time.
    await setGround(page, ground)
    await openPane(page, 'accounts')
    // By its handle: the pane publishes one, and a label is a string that moves.
    await page.getByTestId('accounts-new').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await settle(page)
    await dialog.screenshot({ path: join(OUT, `${ground}-new-account.png`) })
    for (const one of await findings(page)) process.stdout.write(`  ${sayFinding(one)}\n`)
  }
})
