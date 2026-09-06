/**
 * The unauthenticated screens, captured in both grounds.
 *
 * **The sweep cannot reach these.** It signs in first and walks the rail, so
 * sign-in, the first-run claim and the forced password change are outside what
 * it can see -- named in the `visual-check` skill as not covered. They need no
 * persona and no case: the route is what the app serves to a caller with no
 * session at all.
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { test } from '@playwright/test'

import { requireServedApp } from '../support/app.js'
import { setGround, shoot, quiesce, type Ground } from './view.js'

const OUT = join(process.cwd(), '.visual', 'auth')
const GROUNDS = (process.env['VISUAL_GROUNDS'] ?? 'light,dark').split(',') as Ground[]

test('captures the screens shown before anyone signs in', async ({ browser, baseURL }) => {
  await requireServedApp(baseURL ?? '')
  await mkdir(OUT, { recursive: true })

  const page = await browser.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })

  for (const ground of GROUNDS) {
    await page.goto(baseURL ?? '')
    await quiesce(page)
    await setGround(page, ground)
    await shoot(page, join(OUT, `${ground}-sign-in.png`))

    // The About door, open. Captured from the same page so the dialog is drawn
    // over the screen it is reached from.
    await page.getByTestId('auth-about').click()
    await quiesce(page)
    await shoot(page, join(OUT, `${ground}-sign-in-about.png`))
    await page.keyboard.press('Escape')
    await quiesce(page)

    // The reveal, mid-typing, so the capture shows what it actually does.
    await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery')
    await page.getByTestId('password-reveal').click()
    await quiesce(page)
    await shoot(page, join(OUT, `${ground}-sign-in-revealed.png`))
  }

  await page.close()
})
