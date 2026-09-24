/**
 * **One analyst, alone on the case, over a link slower than their typing.**
 *
 * The real client against the real server, with the delay added in the
 * browser's own network layer so nothing on the server is slowed or stubbed.
 * Nobody else writes, so any refusal is the client refusing the analyst
 * against their own earlier write.
 */
import { expect, test, type Page } from '@playwright/test'

import {
  ADMIN,
  asAdminApi,
  asPersona,
  ensureCase,
  fixtureCaseId,
  requireServedApp,
  settle,
} from './support/app.js'

const sleep = (ms: number) => new Promise((wake) => setTimeout(wake, ms))

test.beforeAll(async ({ browser, baseURL }) => {
  await ensureCase(browser, baseURL ?? '')
})

test.beforeEach(async ({ baseURL }) => {
  await requireServedApp(baseURL ?? '')
})

/** Every request to `path` held `each` ms on the way out and again on the way back. */
async function slow(page: Page, path: string, each: number): Promise<void> {
  await page.route(`**${path}`, async (route) => {
    await sleep(each)
    const response = await route.fetch()
    await sleep(each)
    await route.fulfill({ response })
  })
}

/** Every PATCH to `path`, with the status it was answered. */
function statuses(page: Page, path: string): number[] {
  const seen: number[] = []
  page.on('response', (answer) => {
    if (answer.request().method() === 'PATCH' && answer.url().endsWith(path))
      seen.push(answer.status())
  })
  return seen
}

async function compliance(
  baseURL: string,
  fields: Record<string, unknown>,
): Promise<{ id: string; row: Record<string, unknown> }> {
  const api = await asAdminApi(baseURL)
  try {
    const id = await fixtureCaseId(api)
    const now = (await (await api.get(`/api/cases/${id}/compliance`)).json()) as { version: number }
    if (Object.keys(fields).length > 0) {
      const reset = await api.patch(`/api/cases/${id}/compliance`, {
        data: { ...fields, version: now.version },
      })
      expect(reset.status()).toBe(200)
    }
    return {
      id,
      row: (await (await api.get(`/api/cases/${id}/compliance`)).json()) as Record<string, unknown>,
    }
  } finally {
    await api.dispose()
  }
}

async function incidentFacts(page: Page, caseId: string): Promise<void> {
  await page.goto(`/cases/${caseId}/compliance`, { waitUntil: 'domcontentloaded' })
  const fold = page.locator('[data-fold="Incident facts"]')
  await expect(fold).toBeVisible()
  if ((await fold.getAttribute('aria-expanded')) === 'false') await fold.click()
}

// [keystroke gap ms, added latency each way ms, text]
const TYPED: [number, number, string][] = [
  [120, 75, 'loss'],
  [150, 100, 'revenue loss'],
  [15, 0, 'revenue loss'],
]

test.describe('a compliance answer typed alone', () => {
  test.setTimeout(120_000)

  for (const [gap, each, text] of TYPED) {
    test(`is stored as typed: "${text}", keys every ${String(gap)}ms, +${String(each)}ms each way`, async ({
      browser,
      baseURL,
    }) => {
      const { id } = await compliance(baseURL ?? '', {
        financial_impact: `reset ${String(Date.now())}`,
      })
      const { context, page } = await asPersona(browser, ADMIN)
      try {
        await slow(page, `/api/cases/${id}/compliance`, each)
        const seen = statuses(page, `/api/cases/${id}/compliance`)
        await incidentFacts(page, id)
        const field = page.getByRole('textbox', { name: 'Financial impact' })
        await field.fill('')
        await field.pressSequentially(text, { delay: gap })
        await field.blur()
        await sleep(Math.max(1500, each * 2 * 6))

        const { row } = await compliance(baseURL ?? '', {})
        expect({
          statuses: seen,
          stored: row.financialImpact,
          shown: await field.inputValue(),
          bands: await page.getByRole('group', { name: /changed/ }).count(),
        }).toEqual({ statuses: [200], stored: text, shown: text, bands: 0 })
      } finally {
        await page.unrouteAll({ behavior: 'ignoreErrors' })
        await context.close()
      }
    })
  }

  test('stores a figure as typed, not its first digits', async ({ browser, baseURL }) => {
    const { id } = await compliance(baseURL ?? '', { financial_loss_eur: null })
    const { context, page } = await asPersona(browser, ADMIN)
    try {
      await slow(page, `/api/cases/${id}/compliance`, 100)
      const seen = statuses(page, `/api/cases/${id}/compliance`)
      await incidentFacts(page, id)
      const field = page.getByRole('spinbutton', { name: 'Direct financial loss (EUR)' })
      await field.click()
      await field.pressSequentially('250000', { delay: 120 })
      await field.blur()
      await sleep(2000)

      const { row } = await compliance(baseURL ?? '', {})
      expect({ statuses: seen, stored: row.financialLossEur }).toEqual({
        statuses: [200],
        stored: 250000,
      })
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await context.close()
    }
  })
})

test.describe('the Overview typed alone', () => {
  test.setTimeout(120_000)

  test('stores two fields left inside one round trip', async ({ browser, baseURL }) => {
    const api = await asAdminApi(baseURL ?? '')
    const id = await fixtureCaseId(api)
    await api.dispose()
    const { context, page } = await asPersona(browser, ADMIN)
    try {
      await slow(page, `/api/cases/${id}`, 100)
      const seen = statuses(page, `/api/cases/${id}`)
      await page.goto(`/cases/${id}/overview`, { waitUntil: 'domcontentloaded' })
      await page.getByRole('tab', { name: 'Properties' }).click()
      await settle(page)

      const mark = String(Date.now())
      await page.getByRole('textbox', { name: 'Analyst', exact: true }).fill(`Analyst ${mark}`)
      await page
        .getByRole('textbox', { name: 'Detection source', exact: true })
        .fill(`Source ${mark}`)
      await page.getByRole('textbox', { name: 'Detection source', exact: true }).blur()
      await sleep(2000)

      const check = await asAdminApi(baseURL ?? '')
      const row = (await (await check.get(`/api/cases/${id}`)).json()) as Record<string, unknown>
      await check.dispose()
      expect({
        statuses: seen,
        stored: [row.analyst, row.detectionSource],
        bands: await page.getByRole('group', { name: /changed/ }).count(),
      }).toEqual({ statuses: [200, 200], stored: [`Analyst ${mark}`, `Source ${mark}`], bands: 0 })
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await context.close()
    }
  })
})
