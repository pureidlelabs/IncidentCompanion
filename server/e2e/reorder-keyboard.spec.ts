import { expect, test, type Page } from '@playwright/test'

import { ADMIN, asAdminApi, asPersona, demoCase, section, settle } from './support/app.js'

/**
 * **A keyboard drag on the report outline commits.**
 *
 * This is the only tier that can answer it. The unit tests hold the outline's
 * arithmetic against fixtures; whether the gesture moves a section and posts a
 * write needs a real drag implementation, measured rects and the mutation
 * behind them - and jsdom gives every element a zero box, so the whole
 * mechanism is invisible one tier down.
 *
 * The failure it guards is a silent one: a keyboard drag that never leaves the
 * row it picked up announces the pickup, accepts every arrow and posts
 * nothing. The outline is the one mixed-height sortable here, which is where
 * that failure can hide.
 */

/**
 * The keys React Aria's own live region names.
 *
 * **`Enter` to drop, not `Space`.** Measured against a wired outline with the
 * handler instrumented: a drop on `Space` never reaches `onReorder` at all,
 * and the same gesture ending in `Enter` fires it with a real target and posts
 * the order.
 *
 *     Space/ArrowDown/Space:  onReorder fired: (never)          POSTs=0
 *     Enter/ArrowDown/Enter:  onReorder fired: {"dropPosition":"before"}  POSTs=1
 *
 * The library says so itself, in the region this spec reads: *"Started
 * dragging. Press Tab to navigate to a drop target, then press Enter to drop,
 * or press Escape to cancel."* -> https://react-aria.adobe.com/dnd
 */
const DROP = 'Enter'

/**
 * The grip's accessible name.
 *
 * **`Drag`, because React Aria names the drag button itself.** `SortableItem`
 * deliberately gives it no `aria-label` -- *"React Aria names the drag button
 * after the row's own text, and an explicit label would win and say less"* --
 * and what it produces is `Drag <the row's text>`. The outline drew as a plain
 * `<ol>` until #381 was wired, so no grip had ever been named at all and this
 * pattern had never matched anything.
 */
const GRIP = /^Drag /

/**
 * Take hold of the grip on the section at `index`, the way a keyboard reaches it.
 *
 * **A grip cannot be focused directly, and that is the collection working.**
 * `GridList` keeps a roving tabindex: every row but the focused one is
 * `tabindex="-1"`, so `locator.focus()` on a grip inside another row is pulled
 * back to the focused row and the drag never starts at all. Measured -- asking
 * for the fourth grip and pressing Enter left focus on the first row and
 * `onDragStart` never fired.
 *
 * So the route is the one a person has: the grid takes focus on its first row,
 * the arrow keys move between rows, and `keyboardNavigationBehavior="tab"` is
 * what makes Tab step into that row's own controls.
 */
async function takeGrip(page: Page, index: number): Promise<string> {
  await page.locator('[aria-label="Report sections"] [role="row"]').first().focus()
  for (let step = 0; step < index; step += 1) {
    await page.keyboard.press('ArrowDown')
    await settle(page, 200)
  }
  await page.keyboard.press('Tab')
  await settle(page, 250)

  /**
   * **What actually has focus, rather than the grip at that index.** A row's
   * own controls are what Tab steps through, so which press lands on the grip
   * is the row's business; naming it by position asserts a DOM order this
   * spec does not own.
   */
  const held = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')
  expect(held, 'Tab did not reach a grip, so no drag could start').toMatch(/^Drag /)
  return held
}


/**
 * The order of the outline, read off the grips' accessible names.
 *
 * **One clean name per row, which the rows themselves do not give.** A row's
 * own `innerText` is its heading *and* its body, with an ordinal in
 * front - so a section that moves reads differently at its new position, and
 * comparing raw text reports that everything changed and nothing moved.
 */
async function gripOrder(page: Page): Promise<string[]> {
  const grips = await page.getByRole('button', { name: GRIP }).all()
  return Promise.all(grips.map(async (one) => (await one.getAttribute('aria-label')) ?? ''))
}

async function announced(page: Page): Promise<string> {
  return (await page.locator('[role="status"], [aria-live]').allInnerTexts()).join(' | ').trim()
}

test('moves a report section with the keyboard, and keeps it', async ({ browser, baseURL }) => {
  const { page } = await asPersona(browser, ADMIN)

  const api = await asAdminApi(baseURL ?? '')
  const demo = await demoCase(api, 'DEMO-2026-001')

  /**
   * Pick the first draft off the report index, which is what the page shows
   * when the section is open and no report is.
   *
   * **A *draft* report, because the section lands on the index and the first
   * row is a sent one.** There is one route per section and none per report -
   * `routes.tsx` - so a report is reached by pressing its title, which is a
   * button rather than a link for the same reason. A sent report is frozen:
   * every toolbar renders disabled and there is no grip at all, so taking the
   * first row measured a screen with nothing to reorder.
   */
  const pickDraft = async () => {
    const draft = page.getByRole('row').filter({ hasText: 'Draft' }).first()
    await draft.waitFor({ state: 'visible', timeout: 15_000 })
    await draft.getByRole('button').first().click()
    await settle(page)
  }

  /**
   * Reach the report section and open a draft in it.
   *
   * **Two halves, because a reload keeps the section and loses the report.**
   * `section()` walks the case rail, and the rail row for a section the page
   * is already on is not there to be walked to -- so coming back after a
   * reload picks a draft without navigating anywhere.
   */
  const openDraft = async () => {
    await section(page, 'report')
    await settle(page)
    await pickDraft()
  }

  await page.goto(`/cases/${demo}/timeline`)
  await settle(page)
  await openDraft()

  /**
   * **Relative to whatever order it finds, because this spec writes.** The
   * demo case keeps the move, so a second run starts from the first run's
   * result - an assertion naming a fixed order passes once and then reports a
   * defect that is its own leftovers.
   */
  const before = await gripOrder(page)
  expect(before.length, 'the outline has too few sections to reorder').toBeGreaterThan(1)

  /**
   * **The drag has to cross a change of row height, or this spec measures
   * nothing.** A drop that under-shoots by the difference between two row
   * heights is invisible between rows of one height, and the generated
   * sections are all a single line - so taking the first grip finds the defect
   * only while a written section happens to be beside it.
   */
  const heights = await Promise.all(
    (await page.getByRole('button', { name: GRIP }).all()).map(async (one) => {
      // **The grid row, not an `<li>`.** A wired outline is a `Sortable` over
      // `GridList`, so the grip sits in a `gridcell` inside a `row`. Measured:
      // the ancestors are gridcell, row, grid. -> #381
      const row = one.locator('xpath=ancestor::*[@role="row"][1]')
      const box = await row.boundingBox()
      return box?.height ?? 0
    }),
  )
  /**
   * **Either way round, because this spec writes to a shared demo.** What the
   * case needs is a drag *between rows of different heights* -- a measurement
   * that is invisible between two single-line rows. It asked for a taller row
   * above a shorter one, and since it keeps its own move, run it enough times
   * and every tall section ends up at the bottom: `[38,38,38,38,38,38,164.8,
   * 164.8,164.8]`, no such pair left, and a precondition that starves.
   *
   * A short row dragged over a tall one crosses the same mismatch.
   */
  const mixed = heights.findIndex(
    (height, index) =>
      index + 1 < heights.length && Math.abs(height - heights[index + 1]!) > 40,
  )
  expect(
    mixed,
    `no two neighbouring sections differ in height, so the defect this guards ` +
      `cannot occur here - heights were ${JSON.stringify(heights)}`,
  ).toBeGreaterThanOrEqual(0)

  const moving = await takeGrip(page, mixed)

  // The live region is read between the steps, because it is what tells a
  // pickup that never happened from a move that did not commit.
  await page.keyboard.press('Enter')
  await settle(page)
  const pickup = await announced(page)

  await page.keyboard.press('ArrowDown')
  await settle(page)
  const arrow = await announced(page)

  await page.keyboard.press(DROP)
  await settle(page)

  /**
   * **The announcements are read for the failure message, not asserted on.**
   *
   * The region is transient: read at a fixed 700ms it carries *"Insert between
   * ... and ..."*, and read after `settle` it is empty, because React Aria's
   * announcer clears it. An assertion on it fails on timing rather than on the
   * drag.
   *
   * What the drag has to do is below, on the order and on the reload. These
   * two strings go into the message when that fails, which is what separates a
   * pickup that never happened from a write that was refused.
   */
  const trace = `pickup announced ${JSON.stringify(pickup)}, arrow ${JSON.stringify(arrow)}`

  const after = await gripOrder(page)
  expect(after, `the keyboard drag moved nothing -- ${trace}`).not.toEqual(before)
  expect(after.indexOf(moving), 'the section did not move down exactly one place').toBe(
    before.indexOf(moving) + 1,
  )

  /**
   * **Reloaded, because a move that only repaints is the failure this is
   * about.** A fix that reordered the list client-side and posted nothing
   * would pass every assertion above and lose the analyst's work on the next
   * load.
   */
  await page.reload()
  await settle(page)

  /**
   * **Reopened rather than restored.** A report has no address of its own, so
   * a reload lands on the index and the report is opened again by hand. That
   * a reload should land back on the report it named is a separate property,
   * and it belongs to the branch that gives a report an address. -> #397
   */
  await pickDraft()
  await expect(
    page.locator('[aria-label="Report sections"]'),
    'the report did not reopen after the reload',
  ).toBeVisible({ timeout: 15_000 })

  expect(await gripOrder(page), 'the move was not written to the case').toEqual(after)
})
