/**
 * The analyst's own account screen, captured in both grounds.
 *
 * **The sweep cannot reach it.** `panes()` discovers what to walk from
 * `[data-testid^="picker-row-"]`, and `/account` is reached from the profile
 * card at the rail's foot rather than from a picker row - so the screen is
 * structurally invisible to it.
 *
 * ```bash
 * npx playwright test e2e/visual/account.spec.ts \\
 *   --config=e2e/visual/playwright.visual.config.ts
 * ```
 */
import { test } from '@playwright/test'

import { ADMIN, asPersona, requireServedApp, settle } from '../support/app.js'
import { findings, setGround, shoot, sayFinding } from './view.js'

const OUT = process.env['SHOT_DIR'] ?? '.visual/current'

test('captures the personal account screen', async ({ browser, baseURL }) => {
  await requireServedApp(baseURL ?? '')

  const { page } = await asPersona(browser, ADMIN)
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.goto('/account')
  await settle(page)

  for (const ground of ['light', 'dark'] as const) {
    await setGround(page, ground)
    await settle(page)
    await shoot(page, `${OUT}/${ground}-account.png`)

    for (const finding of await findings(page)) {
      process.stdout.write(`${ground} account: ${sayFinding(finding)}\n`)
    }
  }
})
