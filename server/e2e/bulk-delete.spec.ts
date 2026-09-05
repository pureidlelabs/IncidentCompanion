/**
 * **Deleting a selection, pressed in a browser, on a collection whose name has
 * an underscore.**
 *
 * **The underscore is the fixture, not an incidental choice.** The eight
 * single-word collections were unharmed by the defect this covers, so a spec
 * proving bulk delete on Assets passes throughout.
 * -> `react-ui/a-map-whose-keys-are-data-cannot-cross-fromwire`,
 *    `testing/a-read-only-browser-tier-cannot-see-a-contract-disagreement`
 *
 * **Asserted twice: the rows leave the table, and they leave the
 * collection.** A delete that half-works, or a client dropping rows
 * optimistically without landing the write, shows a clean empty table either
 * way. The API read is the claim; the screen is what the analyst gets.
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
 *
 * **Both, rather than one and an argument that the other is the same.** They
 * are the same only if the wire shape is the single cause, and the whole
 * lesson of the defect is that a shape which looks obviously right per-half
 * can be wrong end to end. `impact` and `report_blocks` carry underscores too
 * and are not selectable entities; these two are what an analyst can tick.
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
       * **Seeded through the API, deleted through the screen.** The write path
       * is not what is under test and driving two Add dialogs to reach it
       * spends four minutes on the half `writing.spec` already covers.
       *
       * **Unique per run**, because this tier runs against a database that
       * persists between runs and the case is shared with every other spec on
       * this worker: a fixed string would select rows an earlier run left and
       * assert about them.
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
       * The six scoped screens draw their own `BulkActionBar`, and its Delete
       * loops one `DELETE` per row - it never reaches `POST /bulk-delete` and
       * could not have caught this. Only the mixed table groups a selection by
       * collection, which is the client half that was wrong.
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
       * **Scoped to the filter bar.** The bulk bar is portalled into a slot
       * there (`SelectionActions`), and every row also carries a Delete in its
       * actions column - an unscoped `getByRole` finds three and `.first()`
       * would press a single-row delete, which is a different route and would
       * pass over the defect.
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
       * `ConfirmDeleteDialog` awaits the write and *stays open* on a refusal,
       * rendering the server's own message in place of the consequence line -
       * so on the pre-fix wire shape this assertion fails with "Invalid key in
       * record" on screen, which names the defect rather than a timeout.
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
 *
 * Read off the dialog rather than off a toast: this refusal is rendered in
 * place of the consequence line, and a spec that reported "timed out waiting
 * for the dialog to close" would send the next reader to the dialog rather
 * than to the wire.
 */
async function refusal(page: Page): Promise<string> {
  const said = await page.locator(DIALOG).allInnerTexts()
  return said.join(' ').replace(/\s+/g, ' ').slice(0, 200) || 'nothing on screen'
}
