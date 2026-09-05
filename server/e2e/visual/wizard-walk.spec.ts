/**
 * The import wizard, walked end to end and captured at every step.
 */
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { ADMIN, asAdminApi, asPersona, requireServedApp, settle } from '../support/app.js'
import { findings, setGround, sayFinding } from './view.js'

const OUT = process.env['SHOT_DIR'] ?? join(process.cwd(), '.visual', 'wizard')
const GROUNDS = (process.env['VISUAL_GROUNDS'] ?? 'light,dark').split(',') as ('light' | 'dark')[]

test('walks the import wizard on the demo source', async ({ browser, baseURL }) => {
  await requireServedApp(baseURL ?? '')

  const { page } = await asPersona(browser, ADMIN)
  await page.setViewportSize({ width: 1440, height: 900 })

  // A real case to import into, by id: the picker keeps demos out of Your
  // cases on purpose, so the rail is not a way to reach one.
  const api = await asAdminApi(baseURL ?? '')
  const cases = (await (await api.get('/api/cases')).json()) as { id: string; isDemo?: boolean }[]
  const demo = cases.find((one) => one.isDemo)
  if (!demo) throw new Error('no demo case is installed - this needs real content')

  for (const ground of GROUNDS) {
    await page.goto(`/cases/${demo.id}/import-sentinel?importer=demo`)
    await settle(page)
    await setGround(page, ground)

    // **Review is captured whole.** It is the only step that runs past the
    // viewport - a per-incident panel of candidate rows, so its length is a
    // function of what was ticked - and a capture cut at 900px shows the first
    // incident and none of the case fields the step exists to collect.
    const shot = async (name: string, whole = false) => {
      await settle(page)
      await page.screenshot({ path: join(OUT, `${ground}-${name}.png`), fullPage: whole })
      for (const one of await findings(page)) process.stdout.write(`  ${ground}/${name}: ${sayFinding(one)}\n`)
    }

    await shot('1-connect')

    // **Its own sign-in, which the fixture answers without a network.**
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('button', { name: /aurora-soc/ })).toBeVisible()
    await shot('2-workspace')

    await page.getByRole('button', { name: /aurora-soc/ }).click()
    await expect(page.getByRole('checkbox', { name: /Import incident/ }).first()).toBeVisible()
    await shot('3-incidents')

    // Every incident the fixture offers, so Review has rows to draw.
    for (const box of await page.getByRole('checkbox', { name: /Import incident/ }).all()) {
      if (!(await box.isChecked())) await box.check()
    }
    await page.getByRole('button', { name: /Continue|Review/ }).first().click()
    await settle(page)
    await shot('4-review', true)

    // **What Review actually holds**, which a capture cut at the viewport
    // cannot say: the pane scrolls inside the page, so `fullPage` returns the
    // same 900px either way.
  }
})
