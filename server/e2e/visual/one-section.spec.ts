/**
 * One section of the demo case, captured and probed.
 */
import { test } from '@playwright/test'

import { ADMIN, asAdminApi, asPersona, requireServedApp, section, settle } from '../support/app.js'
import { findings, setGround, shoot, sayFinding } from './view.js'

const SLUG = process.env['SECTION'] ?? 'cloud-apps'
const OUT = process.env['SHOT_DIR'] ?? '/tmp/section'

test(`captures ${SLUG} on the demo case`, async ({ browser, baseURL }) => {
  await requireServedApp(baseURL ?? '')

  const { page } = await asPersona(browser, ADMIN)
  await page.setViewportSize({ width: 1440, height: 900 })

  // **By id, because the picker keeps demos out of Your cases on purpose.**
  const api = await asAdminApi(baseURL ?? '')
  const cases = (await (await api.get('/api/cases')).json()) as
    { id: string; isDemo?: boolean }[]
  const demo = cases.find((one) => one.isDemo)
  if (!demo) throw new Error('no demo case is installed - this needs real content')

  await page.goto(`/cases/${demo.id}/timeline`)
  await settle(page)

  for (const ground of ['light', 'dark'] as const) {
    await setGround(page, ground)
    await section(page, SLUG)
    await settle(page)
    await shoot(page, `${OUT}/${ground}-${SLUG}.png`)

    // **And folded**, which is where a parent stands in for the child that is
    // current - the state the sweep never reaches.
    if (process.env['FOLD'] === '1') {
      const folder = page.getByRole('button', { name: /toggle sidebar/i }).first()
      await folder.click()
      await settle(page)
      await shoot(page, `${OUT}/${ground}-${SLUG}-folded.png`)
      await folder.click()
      await settle(page)
    }
    for (const finding of await findings(page)) {
      process.stdout.write(`${ground} ${SLUG}: ${sayFinding(finding)}\n`)
    }
  }
})
