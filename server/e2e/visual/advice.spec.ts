import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import {
  ADMIN,
  asAdminApi,
  asPersona,
  closeDialog,
  requireServedApp,
  section,
  settle,
} from '../support/app.js'
import { quiesce, setGround, type Ground } from './view.js'

/**
 * **Where the advice line lands, measured rather than looked at.**
 *
 * **The tier below cannot answer this.** jsdom gives every element a zero box,
 * so the unit test that asserts the sentence is in the DOM says nothing about
 * whether it is under the control it is about or on top of the field beneath
 * it - and a 12px line in the muted ink is exactly the size of thing a
 * full-viewport glance passes.
 */
const OUT = join(process.cwd(), '.visual', 'advice')

/**
 * The two doors that advise, and the value each is advised about.
 *
 * **Both, because they share one renderer and not one code path.** The sentence
 * comes out of `Field`'s hint slot either way, so a treatment that breaks
 * breaks for both - but which field is advised, and on what, is decided per
 * collection, and a second arm that never reached a screen is exactly what a
 * unit test cannot see.
 */
const DOORS = [
  {
    slug: 'network',
    button: 'Add network',
    kind: 'ipv6',
    field: 'Value',
    bad: '2001:db8:zzzz',
    said: 'This does not look like an IPv6 address.',
  },
  {
    slug: 'malware',
    button: 'Add malware',
    field: 'Hash',
    bad: 'sha256:e3b0c44298fc1c149afbf4',
    said: 'This does not look like a file hash.',
  },
] as const

const GROUNDS = (process.env['VISUAL_GROUNDS'] ?? 'light,dark').split(',') as Ground[]

test('draws advice under the control it is about', async ({ browser, baseURL }) => {
  await requireServedApp(baseURL ?? '')
  await mkdir(OUT, { recursive: true })

  const { page } = await asPersona(browser, ADMIN)
  await page.setViewportSize({ width: 1440, height: 900 })

  // The demo case by id, because the picker keeps demos out of Your cases.
  const api = await asAdminApi(baseURL ?? '')
  const cases = (await (await api.get('/api/cases')).json()) as {
    id: string
    isDemo?: boolean
  }[]
  const demo = cases.find((one) => one.isDemo)
  expect(demo, 'no demo case is installed').toBeTruthy()
  await page.goto(`/cases/${demo!.id}/timeline`)
  await settle(page)

  for (const ground of GROUNDS) {
    await setGround(page, ground)

    for (const door of DOORS) {
      const where = `${door.slug} in ${ground}`
      await section(page, door.slug)
      await quiesce(page)

      const add = page.getByRole('button', { name: door.button }).first()
      await add.waitFor({ state: 'visible', timeout: 15_000 })
      await add.click()

      const dialog = page.getByRole('dialog')
      await dialog.waitFor({ state: 'visible', timeout: 15_000 })

      if ('kind' in door) {
        // The kind decides what the value means, so it is chosen first - the
        // order the plate draws them in.
        await dialog.getByRole('combobox', { name: /^Kind/ }).click()
        await page.locator(`[role="option"][data-value="${door.kind}"]`).click()
      }

      const control = dialog.getByLabel(door.field, { exact: true })
      await control.fill(door.bad)
      // **Leaving the field is what starts its advice speaking.** Tab rather
      // than a click elsewhere, which lands on whatever is under the pointer.
      await control.press('Tab')

      const line = dialog.getByText(door.said)
      await expect(line, `no advice on ${door.bad} for ${where}`).toBeVisible({ timeout: 10_000 })
      await quiesce(page)
      await dialog.screenshot({ path: join(OUT, `${ground}-${door.slug}.png`) })

      /**
       * **The primitive's boxes, not a `querySelector` for a `name`.**
       */
      const box = async (of: typeof line, what: string) => {
        const found = await of.boundingBox()
        expect(found, `${what} has no box for ${where}`).not.toBeNull()
        return {
          top: Math.round(found!.y),
          bottom: Math.round(found!.y + found!.height),
          left: Math.round(found!.x),
        }
      }

      const box_ = await box(control, 'the control')
      /**
       * **The described element, not the text inside it.**
       */
      const ids = (await control.getAttribute('aria-describedby'))?.split(' ') ?? []
      const described = dialog
        .locator(ids.map((one) => `#${one}`).join(', '))
        .filter({ hasText: door.said })
      const advice = await box(described, 'the advice row')
      console.log(`ADVICE ${where} control=${JSON.stringify(box_)} advice=${JSON.stringify(advice)}`)

      // **Under it, never over it.** The line joins a plate that was already
      // laid out, so landing on the control is the failure worth naming.
      expect(advice.top, `advice overlaps the control for ${where}`).toBeGreaterThanOrEqual(
        box_.bottom,
      )
      // Within a line of it: further away and it is describing whatever is
      // between the two.
      expect(advice.top - box_.bottom, `advice is adrift for ${where}`).toBeLessThan(20)
      // Left-aligned with the control, so it reads as belonging to it.
      expect(
        Math.abs(advice.left - box_.left),
        `advice is not aligned with its control for ${where}`,
      ).toBeLessThan(2)

      // **Shut it before the next door.** An open dialog swallows the click
      // meant for the Add button underneath it, and the next pass then reports
      // a fifteen-second timeout on a control that is present and enabled.
      await closeDialog(page)
    }
  }
})
