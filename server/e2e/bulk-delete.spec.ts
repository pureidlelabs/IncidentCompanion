/**
 * **Deleting a selection, pressed in a browser, on a collection whose name has
 * an underscore.**
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import {
  ADMIN,
  asAdminApi,
  asPersona,
  complaints,
  DIALOG,
  ensureCase,
  fixtureCaseId,
  openFirstCase,
  requireServedApp,
  section,
  settle,
} from './support/app.js'

/**
 * The two collections whose names survive the wire as more than one word.
 */
const UNDERSCORED = [
  {
    collection: 'network_indicators',
    /** The field the entities table reads as the row's identity. -> `entityKinds` */
    row: (mark: string) => ({ type: 'domain', value: `${mark}.test` }),
    kind: 'Network',
  },
  {
    collection: 'cloud_apps',
    row: (mark: string) => ({ appName: mark }),
    kind: 'Cloud',
  },
] as const

test.beforeEach(async ({ browser, baseURL }) => {
  await requireServedApp(baseURL ?? '')
  await ensureCase(browser, baseURL ?? '')
})

for (const target of UNDERSCORED) {
  test(`deletes a selection of ${target.collection} from the entities screen`, async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000)
    const api = await asAdminApi(baseURL ?? '')
    const { context, page } = await asPersona(browser, ADMIN)

    try {
      const caseId = await fixtureCaseId(api)
      /**
       * **Seeded through the API, deleted through the screen.**
       */
      const mark = `e2ebulk${target.kind.toLowerCase()}${String(Date.now())}`
      const seeded = await seed(api, caseId, target.collection, [
        target.row(`${mark}a`),
        target.row(`${mark}b`),
      ])
      expect(seeded, `seeding two ${target.collection} rows`).toHaveLength(2)

      await openFirstCase(page)
      /**
       * **The unscoped entities screen, which is where this control lives.**
       */
      await section(page, 'entities')

      // Narrowed to this run's own rows, so "the table is empty afterwards" is
      // a statement about them rather than about a case somebody emptied.
      const search = page.getByLabel('Search every entity in this case')
      await search.fill(mark)
      await settle(page)

      const rows = page.getByRole('row').filter({ hasText: mark })
      await expect(rows, `the two seeded ${target.collection} rows never appeared`).toHaveCount(2)

      await page.getByLabel('Select every row').click()
      await settle(page, 4000)

      /**
       * **Scoped to the filter bar.**
       */
      const bulkDelete = page
        .locator('[data-slot="filter-bar"]')
        .getByRole('button', { name: 'Delete', exact: true })
      await expect(
        bulkDelete,
        'ticking two rows offered no bulk delete at all',
      ).toHaveCount(1)
      await bulkDelete.click()

      const dialog = page.locator(DIALOG)
      await expect(dialog, 'pressing bulk Delete opened no confirmation').toBeVisible()
      // The count is in the title, and it is the one place the confirmation
      // says what it is about to do - a dialog that says "1" over a selection
      // of two is the shape a client-side grouping bug takes.
      await expect(dialog).toContainText('Delete 2 entities?')
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click()

      /**
       * **The dialog closing is the first postcondition, and the sharpest.**
       */
      await expect(
        dialog,
        `the confirmation stayed open - the server refused: ${await refusal(page)}`,
      ).toHaveCount(0, { timeout: 20_000 })

      await settle(page)
      await expect(
        page.getByRole('row').filter({ hasText: mark }),
        `the deleted ${target.collection} rows are still on the screen`,
      ).toHaveCount(0)

      const left = await remaining(api, caseId, target.collection)
      expect(
        seeded.filter((id) => left.includes(id)),
        `${target.collection} rows the screen stopped showing but the case still holds`,
      ).toEqual([])

      const said = (await complaints(page).allInnerTexts()).join(' | ')
      expect(said, `the screen complained after deleting ${target.collection}`).not.toMatch(
        /invalid|failed|went wrong|could not/i,
      )
    } finally {
      await context.close()
      await api.dispose()
    }
  })
}

/** Creates rows straight into a collection, and answers with their ids. */
async function seed(
  api: APIRequestContext,
  caseId: string,
  collection: string,
  rows: readonly Record<string, unknown>[],
): Promise<string[]> {
  const ids: string[] = []
  for (const fields of rows) {
    const made = await api.post(`/api/cases/${caseId}/${collection}`, {
      data: fields,
      failOnStatusCode: false,
    })
    expect(
      made.ok(),
      `seeding a ${collection} row answered ${String(made.status())}: ${await made.text()}`,
    ).toBe(true)
    ids.push(((await made.json()) as { id: string }).id)
  }
  return ids
}

/** Every id the collection still holds. */
async function remaining(
  api: APIRequestContext,
  caseId: string,
  collection: string,
): Promise<string[]> {
  const answer = await api.get(`/api/cases/${caseId}/${collection}`)
  expect(answer.ok(), `reading ${collection} back answered ${String(answer.status())}`).toBe(true)
  return ((await answer.json()) as { id: string }[]).map((row) => row.id)
}

/**
 * What the still-open confirmation is saying, for the failure message.
 */
async function refusal(page: Page): Promise<string> {
  const said = await page.locator(DIALOG).allInnerTexts()
  return said.join(' ').replace(/\s+/g, ' ').slice(0, 200) || 'nothing on screen'
}
