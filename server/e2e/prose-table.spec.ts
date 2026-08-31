/**
 * The table verbs in the report editor, pressed through the menu.
 *
 * **Nothing covered these, in any tier.** They were five buttons reading
 * `+R`, `-R`, `+C`, `-C` and a backspace glyph, and the only claim about them
 * anywhere was a comment. jsdom cannot help: the bubble menus are floating
 * elements it never lays out, so the whole surface is invisible there.
 *
 * **What this exists to catch is one thing.** The verbs used to run from
 * toolbar buttons carrying `onMouseDown` preventDefault, so the caret never
 * left the cell. They run from a menu now, and a menu takes focus. Every
 * command begins `.chain().focus()`, which restores the editor's stored
 * selection - so the caret should survive - but "should" is the word this
 * tier exists to replace. A command acting on no table leaves the document
 * unchanged and raises nothing, which reads exactly like a press that missed.
 */
import { expect, test, type Page } from '@playwright/test'

import { ADMIN, asPersona, requireServedApp, settle } from './support/app.js'

test.beforeEach(async ({ baseURL }) => {
  await requireServedApp(baseURL ?? '')
})

/** The editor body of the first writable section on the report screen. */
async function anEditor(page: Page) {
  const editor = page.locator('.ProseMirror[contenteditable="true"]').first()
  await editor.waitFor({ state: 'visible', timeout: 20_000 })
  return editor
}

/**
 * **A demo case, not the tier's own fixture.** `ensureCase` creates a case
 * with no reports in it, and a report screen with nothing to write in has no
 * editor to put a caret in. The table this inserts is deleted by the last
 * assertion, so the document ends where it started.
 */
test('the verbs of a table act on the table the caret is in', async ({ browser, request }) => {
  const signedIn = await request.post('/api/auth/sign-in/email', {
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  expect(signedIn.ok(), 'the browser tier could not sign in').toBe(true)
  const cases = (await (await request.get('/api/cases')).json()) as
    { id: string; isDemo?: boolean }[]
  const demo = cases.find((row) => row.isDemo)
  expect(demo, 'no demo case - nothing here has a report to write in').toBeDefined()

  const { context, page } = await asPersona(browser, ADMIN)
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/cases/${demo?.id ?? ''}/report`, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await page.getByText(/Customer RCA/i).first().click()
    await settle(page)

    const editor = await anEditor(page)
    await editor.click()
    // **A fresh paragraph first.** Suggestion fires on a `/` at the start of a
    // word, so a caret dropped into the middle of a written section types a
    // literal slash and opens nothing.
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.press('Enter')
    // The slash menu is the only route to a table, and it is the route an
    // analyst has: there is no insert button anywhere.
    await page.keyboard.type('/table')
    // The slash list is a plain `<ul>` of buttons, by design - it is a menu
    // the caret must not leave, so it has no `option` roles to ask for.
    // Not anchored at the start: the row's accessible name opens with its
    // glyph, so it reads as a box glyph, then "Table 3 columns".
    await page.getByRole('button', { name: /Table\b/ }).first().click()
    await settle(page)

    // **The last one, not the first.** The written section this opens already
    // holds a table of its own, so `.first()` measures a table this test never
    // touched - and the row assertion below would then be about the wrong one.
    const tablesBefore = await editor.locator('table').count()
    const table = editor.locator('table').last()
    await expect(table, 'the slash menu did not insert a table').toBeVisible()
    const rowsBefore = await table.locator('tr').count()

    // The caret has to be in a cell for the menu to appear at all - that is
    // the whole difference between this bubble and the formatting one.
    await table.locator('td, th').first().click()
    // **`button`, not `menuitem`.** There is one menu here, so there is no
    // menubar for its trigger to be a `menuitem` of - it is the kit's
    // `MenuTrigger` over an ordinary button. `exact`, because the slash row
    // that inserted the table is a button reading "Table 3 columns".
    const menu = page.getByRole('button', { name: 'Table', exact: true })
    await expect(menu, 'no Table menu with the caret in a cell').toBeVisible()

    await menu.click()
    // Row opens a submenu; its verbs are not in the menu until it does.
    await page.getByRole('menuitem', { name: 'Row' }).click()
    await page.getByRole('menuitem', { name: 'Insert row below' }).click()
    await settle(page)
    // **The assertion the menu could break and the buttons could not.** If the
    // caret left the cell when the menu took focus, this count is unchanged
    // and nothing else says so.
    await expect(table.locator('tr')).toHaveCount(rowsBefore + 1)

    await table.locator('td, th').first().click()
    await page.getByRole('button', { name: 'Table', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Delete table' }).click()
    await settle(page)
    // Back to what the section held before this test ran.
    await expect(editor.locator('table')).toHaveCount(tablesBefore - 1)
  } finally {
    await context.close()
  }
})
