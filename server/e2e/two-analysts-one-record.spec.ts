/**
 * **Two analysts on one record, each in a browser of their own.**
 *
 * The real client against the real server over the real socket: analyst B
 * saves through their own screen, the server announces it, and analyst A's
 * screen is served the new record while A is in the middle of a change. What
 * A's screen then sends, and what the server ends up holding, is the claim.
 */
import { expect, test, type Page, type Request } from '@playwright/test'

import {
  ADMIN,
  ANALYST,
  asAdminApi,
  asPersona,
  ensureAnalyst,
  ensureCase,
  fixtureCaseId,
  requireServedApp,
  settle,
} from './support/app.js'

test.beforeAll(async ({ browser, baseURL }) => {
  await ensureAnalyst(browser, baseURL ?? '')
  await ensureCase(browser, baseURL ?? '')
})

test.beforeEach(async ({ baseURL }) => {
  await requireServedApp(baseURL ?? '')
})

async function properties(page: Page, caseId: string): Promise<void> {
  await page.goto(`/cases/${caseId}/overview`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('tab', { name: 'Properties' }).click()
  await settle(page)
}

/** The case's own PATCHes this page sends, with what the server answered. */
function patchesFrom(page: Page, caseId: string): { version: unknown; status: number }[] {
  const seen: { version: unknown; status: number }[] = []
  page.on('requestfinished', (request: Request) => {
    if (request.method() !== 'PATCH' || !request.url().endsWith(`/api/cases/${caseId}`)) return
    void request.response().then((answer) => {
      seen.push({
        version: (request.postDataJSON() as { version?: unknown }).version,
        status: answer?.status() ?? 0,
      })
    })
  })
  return seen
}

/** The next time this page reads the case again, which is the repaint the socket frame causes. */
function nextRead(page: Page, caseId: string) {
  return page.waitForResponse(
    (answer) =>
      answer.request().method() === 'GET' && answer.url().endsWith(`/api/cases/${caseId}`),
    { timeout: 20_000 },
  )
}

async function stored(baseURL: string, caseId: string): Promise<Record<string, unknown>> {
  const api = await asAdminApi(baseURL)
  try {
    return (await (await api.get(`/api/cases/${caseId}`)).json()) as Record<string, unknown>
  } finally {
    await api.dispose()
  }
}

async function save(page: Page, label: string, value: string): Promise<void> {
  const field = page.getByRole('textbox', { name: label, exact: true })
  await field.fill(value)
  await field.blur()
  await settle(page)
}

test.describe('a case field another analyst saves while this one is in it', () => {
  test.setTimeout(120_000)

  test('is not written over theirs when this analyst leaves it, and both values are shown', async ({
    browser,
    baseURL,
  }) => {
    const api = await asAdminApi(baseURL ?? '')
    const caseId = await fixtureCaseId(api)
    await api.dispose()
    const a = await asPersona(browser, ADMIN)
    const b = await asPersona(browser, ANALYST)
    try {
      const mark = String(Date.now())
      await properties(a.page, caseId)
      await properties(b.page, caseId)
      const sent = patchesFrom(a.page, caseId)

      const analyst = a.page.getByRole('textbox', { name: 'Analyst', exact: true })
      await analyst.fill(`A ${mark}`)
      const repaint = nextRead(a.page, caseId)
      await save(b.page, 'Analyst', `B ${mark}`)
      await repaint
      await analyst.blur()
      await settle(a.page)

      const band = a.page.getByRole('group', { name: /changed Analyst/ })
      await expect(band, 'A was never shown the value B saved').toContainText(`B ${mark}`)
      expect({
        stored: (await stored(baseURL ?? '', caseId)).analyst,
        shown: await analyst.inputValue(),
        written: sent.filter((one) => one.status === 200).length,
      }).toEqual({ stored: `B ${mark}`, shown: `A ${mark}`, written: 0 })
    } finally {
      await a.context.close()
      await b.context.close()
    }
  })

  test('stores this analyst value over theirs when this analyst keeps it', async ({
    browser,
    baseURL,
  }) => {
    const api = await asAdminApi(baseURL ?? '')
    const caseId = await fixtureCaseId(api)
    await api.dispose()
    const a = await asPersona(browser, ADMIN)
    const b = await asPersona(browser, ANALYST)
    try {
      const mark = String(Date.now())
      await properties(a.page, caseId)
      await properties(b.page, caseId)
      const sent = patchesFrom(a.page, caseId)

      const analyst = a.page.getByRole('textbox', { name: 'Analyst', exact: true })
      await analyst.fill(`A ${mark}`)
      const repaint = nextRead(a.page, caseId)
      await save(b.page, 'Analyst', `B ${mark}`)
      await repaint
      const band = a.page.getByRole('group', { name: /changed Analyst/ })
      await band.getByRole('button', { name: 'Keep mine' }).click()
      await settle(a.page)

      await expect(band).toHaveCount(0)
      await expect(analyst).toHaveValue(`A ${mark}`)
      expect({
        stored: (await stored(baseURL ?? '', caseId)).analyst,
        statuses: sent.map((one) => one.status),
      }).toEqual({ stored: `A ${mark}`, statuses: [200] })
    } finally {
      await a.context.close()
      await b.context.close()
    }
  })

  test('stores nothing when this analyst takes the other value, and shows it', async ({
    browser,
    baseURL,
  }) => {
    const api = await asAdminApi(baseURL ?? '')
    const caseId = await fixtureCaseId(api)
    await api.dispose()
    const a = await asPersona(browser, ADMIN)
    const b = await asPersona(browser, ANALYST)
    try {
      const mark = String(Date.now())
      await properties(a.page, caseId)
      await properties(b.page, caseId)
      const sent = patchesFrom(a.page, caseId)

      const analyst = a.page.getByRole('textbox', { name: 'Analyst', exact: true })
      await analyst.fill(`A ${mark}`)
      const repaint = nextRead(a.page, caseId)
      await save(b.page, 'Analyst', `B ${mark}`)
      await repaint
      const band = a.page.getByRole('group', { name: /changed Analyst/ })
      await band.getByRole('button', { name: 'Take theirs' }).click()
      await analyst.blur()
      await settle(a.page)

      await expect(analyst).toHaveValue(`B ${mark}`)
      await expect(band).toHaveCount(0)
      expect({ stored: (await stored(baseURL ?? '', caseId)).analyst, sent }).toEqual({
        stored: `B ${mark}`,
        sent: [],
      })
    } finally {
      await a.context.close()
      await b.context.close()
    }
  })

  test('sends nothing for a field this analyst only put the cursor in', async ({
    browser,
    baseURL,
  }) => {
    const api = await asAdminApi(baseURL ?? '')
    const caseId = await fixtureCaseId(api)
    await api.dispose()
    const a = await asPersona(browser, ADMIN)
    const b = await asPersona(browser, ANALYST)
    try {
      const mark = String(Date.now())
      await properties(a.page, caseId)
      await properties(b.page, caseId)
      const sent = patchesFrom(a.page, caseId)

      const analyst = a.page.getByRole('textbox', { name: 'Analyst', exact: true })
      await analyst.click()
      const repaint = nextRead(a.page, caseId)
      await save(b.page, 'Analyst', `B only ${mark}`)
      await repaint
      await expect(analyst).toHaveValue(`B only ${mark}`)
      await analyst.blur()
      await settle(a.page)

      expect({ stored: (await stored(baseURL ?? '', caseId)).analyst, sent }).toEqual({
        stored: `B only ${mark}`,
        sent: [],
      })
    } finally {
      await a.context.close()
      await b.context.close()
    }
  })

  test('stores this analyst value when the other saved a different field', async ({
    browser,
    baseURL,
  }) => {
    const api = await asAdminApi(baseURL ?? '')
    const caseId = await fixtureCaseId(api)
    await api.dispose()
    const a = await asPersona(browser, ADMIN)
    const b = await asPersona(browser, ANALYST)
    try {
      const mark = String(Date.now())
      await properties(a.page, caseId)
      await properties(b.page, caseId)

      const analyst = a.page.getByRole('textbox', { name: 'Analyst', exact: true })
      await analyst.fill(`A analyst ${mark}`)
      const repaint = nextRead(a.page, caseId)
      await save(b.page, 'Detection source', `B source ${mark}`)
      await repaint
      await analyst.blur()
      await settle(a.page)

      const now = await stored(baseURL ?? '', caseId)
      expect({
        analyst: now.analyst,
        source: now.detectionSource,
        bands: await a.page.getByRole('group', { name: /changed/ }).count(),
      }).toEqual({ analyst: `A analyst ${mark}`, source: `B source ${mark}`, bands: 0 })
    } finally {
      await a.context.close()
      await b.context.close()
    }
  })
})

test.describe('an entry another analyst has open', () => {
  test.setTimeout(120_000)

  test('says who holds it, and stays editable', async ({ browser, baseURL }) => {
    const api = await asAdminApi(baseURL ?? '')
    const caseId = await fixtureCaseId(api)
    const label = `Held row ${String(Date.now())}`
    const made = await api.post(`/api/cases/${caseId}/impact`, {
      data: { label, category: 'credentials' },
    })
    expect(made.ok(), `seeding the row answered ${String(made.status())}`).toBe(true)
    await api.dispose()
    const a = await asPersona(browser, ADMIN)
    const b = await asPersona(browser, ANALYST)
    try {
      await b.page.goto(`/cases/${caseId}/impact`, { waitUntil: 'domcontentloaded' })
      await settle(b.page)
      await b.page.getByRole('button', { name: `Edit ${label} in full` }).click()
      await expect(b.page.getByRole('dialog')).toBeVisible()

      await a.page.goto(`/cases/${caseId}/impact`, { waitUntil: 'domcontentloaded' })
      await settle(a.page)
      const row = a.page.getByRole('row').filter({ hasText: label })
      await expect(row, 'A was never told who holds the row').toContainText(/editing/, {
        timeout: 20_000,
      })

      const pencil = a.page.getByRole('button', { name: `Edit ${label} in full` })
      await expect(pencil).not.toHaveAttribute('aria-disabled', 'true')
      await pencil.click()
      const dialog = a.page.getByRole('dialog')
      await expect(dialog, 'the dialog did not say who else has the entry open').toContainText(
        /is editing this entry/,
      )
      await expect(dialog.getByRole('button', { name: 'Save' })).not.toHaveAttribute(
        'aria-disabled',
        'true',
      )
    } finally {
      await a.context.close()
      await b.context.close()
    }
  })
})
