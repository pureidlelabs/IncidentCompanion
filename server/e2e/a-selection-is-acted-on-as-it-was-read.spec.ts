/**
 * **A selection is acted on as it was read, and a refused dialog keeps what was
 * typed.**
 *
 * The real client against the real server. Another analyst's session changes
 * a row while this analyst's confirmation, bulk edit or edit dialog is open;
 * the server announces it, and the screen behind the dialog repaints. What the
 * server holds afterwards is the claim, and what the screen told the analyst
 * is the other half of it.
 */
import { expect, test, type APIRequestContext } from '@playwright/test'

import {
  ADMIN,
  asAdminApi,
  asPersona,
  ensureCase,
  fixtureCaseId,
  requireServedApp,
  settle,
} from './support/app.js'

interface Impact {
  id: string
  version: number
  label: string
  disposition: string | null
  notes: string | null
}

test.beforeAll(async ({ browser, baseURL }) => {
  await ensureCase(browser, baseURL ?? '')
})

test.beforeEach(async ({ baseURL }) => {
  await requireServedApp(baseURL ?? '')
})

async function seed(api: APIRequestContext, caseId: string, labels: string[]): Promise<Impact[]> {
  const made: Impact[] = []
  for (const label of labels) {
    const answer = await api.post(`/api/cases/${caseId}/impact`, {
      data: { label, category: 'credentials' },
    })
    expect(answer.ok(), `seeding ${label} answered ${String(answer.status())}`).toBe(true)
    made.push((await answer.json()) as Impact)
  }
  return made
}

async function current(
  api: APIRequestContext,
  caseId: string,
  id: string,
): Promise<Impact | undefined> {
  const rows = (await (await api.get(`/api/cases/${caseId}/impact`)).json()) as Impact[]
  return rows.find((row) => row.id === id)
}

/** Another analyst's session writing one row, as that session read it. */
async function otherAnalyst(
  api: APIRequestContext,
  caseId: string,
  row: Impact,
  fields: Record<string, unknown>,
) {
  const now = await current(api, caseId, row.id)
  const answer = await api.patch(`/api/cases/${caseId}/impact/${row.id}`, {
    data: { ...fields, version: now?.version },
  })
  expect(answer.status(), 'the other analyst could not write').toBe(200)
}

test.describe('a selection on Impact', () => {
  test.setTimeout(120_000)

  test('is not deleted when a row in it changed while the confirmation was open', async ({
    browser,
    baseURL,
  }) => {
    const api = await asAdminApi(baseURL ?? '')
    const caseId = await fixtureCaseId(api)
    const [row] = await seed(api, caseId, [`Selected ${String(Date.now())}`])
    const { context, page } = await asPersona(browser, ADMIN)
    try {
      await page.goto(`/cases/${caseId}/impact`, { waitUntil: 'domcontentloaded' })
      await settle(page)
      await page.locator(`label:has([aria-label="Select ${row!.label}"])`).click()
      await page.getByRole('button', { name: 'Delete 1' }).click()
      const confirm = page.getByRole('alertdialog')
      await expect(confirm).toBeVisible()

      const repaint = page.waitForResponse(
        (answer) =>
          answer.url().endsWith(`/api/cases/${caseId}`) && answer.request().method() === 'GET',
      )
      await otherAnalyst(api, caseId, row!, { notes: 'B: this is the one that matters' })
      await repaint

      const answered = page.waitForResponse((answer) => answer.url().endsWith('/bulk-delete'))
      await confirm.getByRole('button', { name: 'Delete' }).click()
      await answered
      expect(await current(api, caseId, row!.id), 'the row B changed was deleted').toMatchObject({
        notes: 'B: this is the one that matters',
      })
      await expect(confirm, 'the analyst was not told which row moved').toContainText(row!.label)
    } finally {
      await context.close()
      await api.dispose()
    }
  })

  test('does not overwrite a row another analyst changed while the bulk edit was open', async ({
    browser,
    baseURL,
  }) => {
    const api = await asAdminApi(baseURL ?? '')
    const caseId = await fixtureCaseId(api)
    const mark = String(Date.now())
    const [first, second] = await seed(api, caseId, [`Bulk one ${mark}`, `Bulk two ${mark}`])
    const { context, page } = await asPersona(browser, ADMIN)
    try {
      await page.goto(`/cases/${caseId}/impact`, { waitUntil: 'domcontentloaded' })
      await settle(page)
      await page.locator(`label:has([aria-label="Select ${first!.label}"])`).click()
      await page.locator(`label:has([aria-label="Select ${second!.label}"])`).click()
      await page.getByRole('button', { name: 'Edit 2' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      const repaint = page.waitForResponse(
        (answer) =>
          answer.url().endsWith(`/api/cases/${caseId}`) && answer.request().method() === 'GET',
      )
      await otherAnalyst(api, caseId, first!, { disposition: 'destroyed' })
      await repaint

      await dialog.getByRole('button', { name: /happened/i }).click()
      await page.getByRole('option', { name: 'encrypted' }).click()
      const answered = page.waitForResponse((answer) => answer.url().endsWith('/impact/bulk'))
      await dialog.getByRole('button', { name: 'Apply' }).click()
      await answered

      expect({
        first: (await current(api, caseId, first!.id))?.disposition,
        second: (await current(api, caseId, second!.id))?.disposition,
      }).toEqual({ first: 'destroyed', second: 'encrypted' })
      await expect(
        page.getByText(new RegExp(`${first!.label}.*not updated`)),
        'the analyst was not told which row moved',
      ).toBeVisible()
    } finally {
      await context.close()
      await api.dispose()
    }
  })
})

test.describe('an edit dialog on Impact', () => {
  test.setTimeout(120_000)

  test('refused by another analyst saving the same field, names the field and their value, and keeps the draft', async ({
    browser,
    baseURL,
  }) => {
    const api = await asAdminApi(baseURL ?? '')
    const caseId = await fixtureCaseId(api)
    const [row] = await seed(api, caseId, [`Edited ${String(Date.now())}`])
    const { context, page } = await asPersona(browser, ADMIN)
    try {
      await page.goto(`/cases/${caseId}/impact`, { waitUntil: 'domcontentloaded' })
      await settle(page)
      await page.getByRole('button', { name: `Edit ${row!.label} in full` }).click()
      const dialog = page.getByRole('dialog')
      const notes = dialog.getByRole('textbox', { name: 'Notes' })
      await notes.fill('A: mine')

      // Whether the announcement or the refusal reaches A first, the band is the same.
      await otherAnalyst(api, caseId, row!, { notes: 'B: theirs' })
      await dialog.getByRole('button', { name: 'Save' }).click()

      const band = dialog.getByRole('group', { name: /changed Notes/ })
      await expect(
        band,
        'the refusal did not name the field and the value that stands',
      ).toContainText('B: theirs')
      await expect(notes).toHaveValue('A: mine')

      await band.getByRole('button', { name: 'Keep mine' }).click()
      await dialog.getByRole('button', { name: 'Save' }).click()
      await expect(dialog).toBeHidden()
      expect((await current(api, caseId, row!.id))?.notes).toBe('A: mine')
    } finally {
      await context.close()
      await api.dispose()
    }
  })
})
