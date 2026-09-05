/**
 * The analyst's own account screen, captured in both grounds.
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
