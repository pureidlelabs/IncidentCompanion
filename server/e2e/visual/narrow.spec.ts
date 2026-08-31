import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { ADMIN, asAdminApi, asPersona, requireServedApp, section, settle } from '../support/app.js'
import { findings } from './view.js'

/**
 * The report index at widths the sweep never runs.
 *
 * **`sweep.spec.ts` runs at 1440x900 and nothing varies it**, which its own
 * skill names as the gap: a width-dependent collision is outside what it can
 * see, and the report table is percentage-columned, so every column narrows
 * together while the text inside them does not.
 *
 * `TLP:AMBER+STRICT` is the stress case and it is a real value rather than an
 * invented one - `tlp.ts` maps it, and it is the longest marking the
 * vocabulary has at 16 characters, set semibold and uppercase in a column that
 * is 12% of whatever the table happens to be.
 *
 * **`settle` rather than `quiesce`, and that is not a shortcut.** The report
 * screen never goes network-idle - its prose is a CRDT over a live socket, so
 * there is no idle moment to wait for and `quiesce` throws after twenty
 * seconds. `settle` polls a geometry fingerprint until two readings agree,
 * which is the thing this spec is about anyway.
 */
const OUT = join(process.cwd(), '.visual', 'narrow')

/**
 * The widths, and why these.
 *
 * 1440 is what the sweep already covers and is here as the control - a finding
 * that also fires there is not a narrow-width finding. 1280 is a small laptop,
 * 1024 a split screen, and 900 is about the narrowest an analyst would work
 * in before the shell itself is the problem.
 */
const WIDTHS = [1440, 1280, 1024, 900]

test('keeps the report table in its columns as the window narrows', async ({
  browser,
  baseURL,
}) => {
  await requireServedApp(baseURL ?? '')
  await mkdir(OUT, { recursive: true })

  const { page } = await asPersona(browser, ADMIN)

  const api = await asAdminApi(baseURL ?? '')
  const cases = (await (await api.get('/api/cases')).json()) as {
    id: string
    isDemo?: boolean
  }[]
  const demo = cases.find((one) => one.isDemo)
  expect(demo, 'no demo case is installed').toBeTruthy()

  /**
   * **The longest marking, put on a real report through the write path.**
   * Editing the fixture in the browser would measure a value the app cannot
   * store; going through the route measures what an analyst can actually
   * produce.
   */
  const reports = (await (await api.get(`/api/cases/${demo!.id}/reports`)).json()) as {
    id: string
    version: number
  }[]
  expect(reports.length, 'the demo case has no reports to widen').toBeGreaterThan(0)
  const first = reports[0]!
  await api.patch(`/api/cases/${demo!.id}/reports/${first.id}`, {
    data: { tlp: 'TLP:AMBER+STRICT', version: first.version },
  })

  // **Land on the timeline and walk the rail**, which is how every other spec
  // in this directory reaches a section. Navigating straight at `/report` and
  // then asking the rail for it too is two navigations, and the second never
  // settles.
  await page.goto(`/cases/${demo!.id}/timeline`)
  await settle(page)
  await section(page, 'report')
  await settle(page)

  const trouble: string[] = []
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    await settle(page)
    await page.screenshot({ path: join(OUT, `report-${String(width)}.png`) })

    /**
     * **Scoped to `main`.** The rail and the shell chrome are the sweep's
     * business and they report the same findings at every width; what this is
     * about is the table.
     */
    const found = await findings(page, 'main')
    for (const one of found) {
      trouble.push(`${String(width)}px ${one.kind}: ${one.what}`)
    }

    // The chip itself, measured against the cell it is in - a probe reports
    // what overlaps, and this says whether the marking still fits its column.
    const chip = page.locator('[data-testid="tlp-chip"]').first()
    if ((await chip.count()) > 0) {
      const fits = await chip.evaluate((el) => {
        const cell = el.closest('td')
        if (!cell) return null
        const own = el.getBoundingClientRect()
        const box = cell.getBoundingClientRect()
        return {
          chip: Math.round(own.width),
          cell: Math.round(box.width),
          overflow: Math.round(own.right - box.right),
        }
      })
      console.log(`NARROW ${String(width)}px tlp ${JSON.stringify(fits)}`)
      if (fits && fits.overflow > 0) {
        trouble.push(`${String(width)}px tlp chip overflows its cell by ${String(fits.overflow)}px`)
      }
    }
  }

  console.log(trouble.length > 0 ? trouble.join('\n') : 'NARROW no findings')
  expect(trouble, 'the report table breaks as the window narrows').toEqual([])
})
